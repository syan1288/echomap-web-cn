import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { grantExtraCredits, type EntitlementEnv } from './entitlements.js';
import { getBearerToken, type HeaderLike } from './authUser.js';
import {
  createAlipayPageForm,
  isAlipayWebPayConfigured,
  loadAlipayConfiguration,
  queryAlipayTransaction,
  type AlipayTransactionQueryResult,
  type AlipayWebPayEnv,
} from './alipayWebPay.js';
import { createWechatNativePayment, isWechatNativePaymentConfigured, type WechatPayNativeEnv } from './wechatPayNative.js';

export type PaymentPlanId = 'plus' | 'pro';
export type PaymentProvider = 'manual' | 'wechat_native' | 'alipay_page';

export type PaymentEnv = EntitlementEnv & WechatPayNativeEnv & AlipayWebPayEnv & {
  ECHO_PAYMENT_PROVIDER?: string;
  ECHO_PAYMENT_ADMIN_KEY?: string;
  CRON_SECRET?: string;
  ECHO_PAYMENT_ORDERS_STORE?: string;
  WECHAT_PAY_API_V3_KEY?: string;
  WECHAT_PAY_PLATFORM_SERIAL_NO?: string;
  WECHAT_PAY_PLATFORM_PUBLIC_KEY?: string;
  WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH?: string;
  ECHO_PAYMENT_ORDERS_PATH?: string;
  ECHO_PLUS_PAYMENT_URL?: string;
  ECHO_PRO_PAYMENT_URL?: string;
  ECHO_PLUS_PAYMENT_INSTRUCTIONS?: string;
  ECHO_PRO_PAYMENT_INSTRUCTIONS?: string;
  ECHO_PLUS_PAYMENT_AMOUNT_CNY?: string;
  ECHO_PRO_PAYMENT_AMOUNT_CNY?: string;
  ECHO_PLUS_PAYMENT_CREDITS?: string;
  ECHO_PRO_PAYMENT_CREDITS?: string;
};

export function isPaymentAdminAuthorized(
  headers: HeaderLike,
  env: PaymentEnv = process.env,
): boolean {
  const expected = env.ECHO_PAYMENT_ADMIN_KEY?.trim();
  if (!expected) return false;

  const rawHeader = headers['x-echo-payment-admin-key'];
  const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const bearerKey = getBearerToken(headers);
  return headerKey === expected || bearerKey === expected;
}

export function isPaymentReconcileAuthorized(
  headers: HeaderLike,
  env: PaymentEnv = process.env,
): boolean {
  if (isPaymentAdminAuthorized(headers, env)) return true;
  const cronSecret = env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authorization = headers.authorization;
  const bearer = Array.isArray(authorization) ? authorization[0] : authorization;
  return bearer === `Bearer ${cronSecret}`;
}

export type PaymentPlan = {
  id: PaymentPlanId;
  name: string;
  amountCny: number;
  credits: number;
  paymentUrl: string;
  instructions: string;
  provider: PaymentProvider;
  enabled: boolean;
};

export type PaymentOrder = {
  id: string;
  userId: string;
  planId: PaymentPlanId;
  planName: string;
  amountCny: number;
  credits: number;
  status:
    | 'pending_manual_confirmation'
    | 'pending_wechat_payment'
    | 'pending_alipay_payment'
    | 'confirmed';
  provider: PaymentProvider;
  paymentUrl: string;
  instructions: string;
  contact: string | null;
  confirmedAt?: string | null;
  providerTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentCheckout = {
  order: PaymentOrder;
  paymentFormHtml?: string;
};

type PaymentOrderStore = {
  orders: Record<string, PaymentOrder>;
  notifications?: Record<
    string,
    true | { orderId: string; providerTransactionId: string; tradeStatus: string }
  >;
};

export type AlipayNotificationInput = {
  orderId: string;
  amountFen: number;
  providerTransactionId: string;
  notifyId: string;
  notifyType: string;
  tradeStatus: string;
  paid: boolean;
  receivedAt: Date;
};

export type PaymentOrderStoreAdapter = {
  create(order: PaymentOrder): Promise<PaymentOrder>;
  get(orderId: string): Promise<PaymentOrder | null>;
  listPending(provider?: PaymentProvider): Promise<PaymentOrder[]>;
  confirm(
    input: {
      orderId: string;
      amountFen?: number;
      providerTransactionId?: string | null;
      provider?: PaymentProvider;
    },
    now: Date
  ): Promise<PaymentOrder>;
  recordAlipayNotification(
    input: AlipayNotificationInput,
  ): Promise<{ order: PaymentOrder; duplicate: boolean }>;
};

type SupabasePaymentOrderRow = Record<string, unknown>;

const paymentStoreLocks = new Map<string, Promise<void>>();

async function withPaymentStoreLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = paymentStoreLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  paymentStoreLocks.set(key, queued);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (paymentStoreLocks.get(key) === queued) paymentStoreLocks.delete(key);
  }
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  return Math.trunc(numberFromEnv(value, fallback));
}

function amountFen(amountCny: number): number {
  return Math.round(amountCny * 100);
}

function paymentProvider(env: PaymentEnv): PaymentProvider {
  const configured = env.ECHO_PAYMENT_PROVIDER?.trim();
  if (configured === 'wechat_native') return 'wechat_native';
  if (configured === 'alipay_page') return 'alipay_page';
  return 'manual';
}

function isWechatPaymentAutomationConfigured(env: PaymentEnv): boolean {
  return Boolean(
    isWechatNativePaymentConfigured(env) &&
      env.WECHAT_PAY_API_V3_KEY?.trim() &&
      env.WECHAT_PAY_PLATFORM_SERIAL_NO?.trim() &&
      (env.WECHAT_PAY_PLATFORM_PUBLIC_KEY?.trim() || env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH?.trim())
  );
}

function ordersPath(env: PaymentEnv): string {
  const explicit = env.ECHO_PAYMENT_ORDERS_PATH?.trim();
  return explicit || path.join(process.cwd(), 'logs', 'payment-orders.json');
}

function readStore(env: PaymentEnv): PaymentOrderStore {
  const filePath = ordersPath(env);
  if (!existsSync(filePath)) return { orders: {} };
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PaymentOrderStore>;
    return {
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
      notifications:
        parsed.notifications && typeof parsed.notifications === 'object'
          ? parsed.notifications
          : {},
    };
  } catch {
    return { orders: {}, notifications: {} };
  }
}

function writeStore(env: PaymentEnv, store: PaymentOrderStore): void {
  const filePath = ordersPath(env);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, filePath);
}

function paymentOrderToSupabaseRow(order: PaymentOrder): SupabasePaymentOrderRow {
  return {
    id: order.id,
    user_id: order.userId,
    plan_id: order.planId,
    plan_name: order.planName,
    amount_cny: order.amountCny,
    credits: order.credits,
    status: order.status,
    provider: order.provider,
    payment_url: order.paymentUrl,
    instructions: order.instructions,
    contact: order.contact,
    confirmed_at: order.confirmedAt ?? null,
    provider_transaction_id: order.providerTransactionId ?? null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

function paymentOrderFromSupabaseRow(row: SupabasePaymentOrderRow | null): PaymentOrder {
  if (!row) throw new Error('Supabase payment order operation returned no order');
  const status = row.status;
  const provider = row.provider;
  const planId = row.plan_id;
  const amountCny = Number(row.amount_cny);
  const credits = Number(row.credits);
  if (
    status !== 'pending_manual_confirmation' &&
    status !== 'pending_wechat_payment' &&
    status !== 'pending_alipay_payment' &&
    status !== 'confirmed'
  ) {
    throw new Error('Supabase payment order has an invalid status');
  }
  if (provider !== 'manual' && provider !== 'wechat_native' && provider !== 'alipay_page') {
    throw new Error('Supabase payment order has an invalid provider');
  }
  if (planId !== 'plus' && planId !== 'pro') {
    throw new Error('Supabase payment order has an invalid plan');
  }
  if (!Number.isFinite(amountCny) || amountCny <= 0 || !Number.isSafeInteger(credits) || credits <= 0) {
    throw new Error('Supabase payment order has invalid amount or credits');
  }

  return {
    id: String(row.id ?? ''),
    userId: String(row.user_id ?? ''),
    planId,
    planName: String(row.plan_name ?? ''),
    amountCny,
    credits,
    status,
    provider,
    paymentUrl: String(row.payment_url ?? ''),
    instructions: String(row.instructions ?? ''),
    contact: typeof row.contact === 'string' ? row.contact : null,
    confirmedAt: typeof row.confirmed_at === 'string' ? row.confirmed_at : null,
    providerTransactionId:
      typeof row.provider_transaction_id === 'string' ? row.provider_transaction_id : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export class SupabasePaymentOrderStore implements PaymentOrderStoreAdapter {
  private readonly client: SupabaseClient;

  constructor(env: PaymentEnv = process.env, client?: SupabaseClient) {
    const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) {
      throw new Error('Supabase payment order store requires SUPABASE_URL and a server-side Supabase key');
    }
    this.client = client ?? createClient(url, key, { auth: { persistSession: false } });
  }

  async create(order: PaymentOrder): Promise<PaymentOrder> {
    const { data, error } = await this.client
      .from('payment_orders')
      .insert(paymentOrderToSupabaseRow(order))
      .select('*')
      .single();
    if (error) throw error;
    return paymentOrderFromSupabaseRow(data as SupabasePaymentOrderRow | null);
  }

  async get(orderId: string): Promise<PaymentOrder | null> {
    const { data, error } = await this.client
      .from('payment_orders')
      .select('*')
      .eq('id', orderId.trim())
      .maybeSingle();
    if (error) throw error;
    return data ? paymentOrderFromSupabaseRow(data as SupabasePaymentOrderRow) : null;
  }

  async listPending(provider?: PaymentProvider): Promise<PaymentOrder[]> {
    let query = this.client
      .from('payment_orders')
      .select('*')
      .in('status', ['pending_manual_confirmation', 'pending_wechat_payment', 'pending_alipay_payment'])
      .order('created_at', { ascending: true });
    if (provider) query = query.eq('provider', provider);
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data)
      ? data.map((row) => paymentOrderFromSupabaseRow(row as SupabasePaymentOrderRow))
      : [];
  }

  async confirm(
    input: {
      orderId: string;
      amountFen?: number;
      providerTransactionId?: string | null;
      provider?: PaymentProvider;
    },
    now: Date
  ): Promise<PaymentOrder> {
    const { data, error } = await this.client.rpc(
      input.provider === 'alipay_page' ? 'confirm_alipay_payment_order' : 'confirm_payment_order',
      {
      p_order_id: input.orderId.trim(),
      p_amount_fen: input.amountFen ?? null,
      p_provider_transaction_id: input.providerTransactionId?.trim() || null,
      p_confirmed_at: now.toISOString(),
      },
    );
    if (error) throw error;
    return paymentOrderFromSupabaseRow(data as SupabasePaymentOrderRow | null);
  }

  async recordAlipayNotification(
    input: AlipayNotificationInput,
  ): Promise<{ order: PaymentOrder; duplicate: boolean }> {
    const { data, error } = await this.client.rpc('process_alipay_payment_notification', {
      p_order_id: input.orderId.trim(),
      p_amount_fen: input.amountFen,
      p_provider_transaction_id: input.providerTransactionId.trim(),
      p_notify_id: input.notifyId.trim(),
      p_notify_type: input.notifyType,
      p_trade_status: input.tradeStatus,
      p_paid: input.paid,
      p_received_at: input.receivedAt.toISOString(),
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') {
      throw new Error('Supabase Alipay notification operation returned no result');
    }
    const result = data as Record<string, unknown>;
    return {
      order: paymentOrderFromSupabaseRow(result.order as SupabasePaymentOrderRow | null),
      duplicate: result.duplicate === true,
    };
  }
}

class FilePaymentOrderStore implements PaymentOrderStoreAdapter {
  constructor(private readonly env: PaymentEnv) {}

  async create(order: PaymentOrder): Promise<PaymentOrder> {
    return withPaymentStoreLock(ordersPath(this.env), async () => {
      const store = readStore(this.env);
      store.orders[order.id] = order;
      writeStore(this.env, store);
      return order;
    });
  }

  async get(orderId: string): Promise<PaymentOrder | null> {
    const store = readStore(this.env);
    return store.orders[orderId.trim()] ?? null;
  }

  async listPending(provider?: PaymentProvider): Promise<PaymentOrder[]> {
    const store = readStore(this.env);
    return Object.values(store.orders)
      .filter((order) =>
        order.status !== 'confirmed' &&
        (!provider || order.provider === provider)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async confirm(
    input: {
      orderId: string;
      amountFen?: number;
      providerTransactionId?: string | null;
      provider?: PaymentProvider;
    },
    now: Date
  ): Promise<PaymentOrder> {
    return withPaymentStoreLock(ordersPath(this.env), async () => {
      const store = readStore(this.env);
      const orderId = input.orderId.trim();
      const existing = store.orders[orderId];
      if (!existing) throw new Error('payment order not found');
      if (input.amountFen != null && input.amountFen !== amountFen(existing.amountCny)) {
        throw new Error('payment amount mismatch');
      }
      const transactionId = input.providerTransactionId?.trim() || null;
      if (
        existing.status === 'confirmed' &&
        transactionId &&
        existing.providerTransactionId &&
        existing.providerTransactionId !== transactionId
      ) {
        throw new Error('payment transaction mismatch');
      }
      if (existing.status === 'confirmed') return existing;

      await grantExtraCredits(existing.userId, existing.credits, this.env, now, undefined, existing.planId);
      const confirmed: PaymentOrder = {
        ...existing,
        status: 'confirmed',
        confirmedAt: now.toISOString(),
        providerTransactionId: transactionId || existing.providerTransactionId || null,
        updatedAt: now.toISOString(),
      };
      store.orders[orderId] = confirmed;
      writeStore(this.env, store);
      return confirmed;
    });
  }

  async recordAlipayNotification(
    input: AlipayNotificationInput,
  ): Promise<{ order: PaymentOrder; duplicate: boolean }> {
    return withPaymentStoreLock(ordersPath(this.env), async () => {
      const store = readStore(this.env);
      const notifyId = input.notifyId.trim();
      const orderId = input.orderId.trim();
      const existing = store.orders[orderId];
      if (!existing || existing.provider !== 'alipay_page') {
        throw new Error('Alipay payment order not found');
      }
      if (input.amountFen !== amountFen(existing.amountCny)) {
        throw new Error('payment amount mismatch');
      }

      store.notifications ??= {};
      const previousNotification = store.notifications[notifyId];
      if (previousNotification) {
        if (
          previousNotification !== true &&
          (previousNotification.orderId !== orderId ||
            previousNotification.providerTransactionId !== input.providerTransactionId ||
            previousNotification.tradeStatus !== input.tradeStatus)
        ) {
          throw new Error('Alipay notification ID was reused with different data');
        }
        return { order: existing, duplicate: true };
      }
      if (existing.status === 'confirmed') {
        if (existing.providerTransactionId !== input.providerTransactionId) {
          throw new Error('payment transaction mismatch');
        }
      } else if (input.paid) {
        if (existing.status !== 'pending_alipay_payment') {
          throw new Error('Alipay payment order cannot be confirmed from current status');
        }
        await grantExtraCredits(
          existing.userId,
          existing.credits,
          this.env,
          input.receivedAt,
          undefined,
          existing.planId,
        );
        store.orders[orderId] = {
          ...existing,
          status: 'confirmed',
          confirmedAt: input.receivedAt.toISOString(),
          providerTransactionId: input.providerTransactionId,
          updatedAt: input.receivedAt.toISOString(),
        };
      }

      store.notifications[notifyId] = {
        orderId,
        providerTransactionId: input.providerTransactionId,
        tradeStatus: input.tradeStatus,
      };
      writeStore(this.env, store);
      return { order: store.orders[orderId] ?? existing, duplicate: false };
    });
  }
}

export function createPaymentOrderStore(env: PaymentEnv = process.env): PaymentOrderStoreAdapter {
  const configuredStore = env.ECHO_PAYMENT_ORDERS_STORE?.trim().toLowerCase();
  if (!configuredStore || configuredStore === 'file') return new FilePaymentOrderStore(env);
  if (configuredStore === 'supabase') {
    if (env.ECHO_ENTITLEMENTS_STORE?.trim().toLowerCase() !== 'supabase') {
      throw new Error('Supabase payment order storage requires ECHO_ENTITLEMENTS_STORE=supabase');
    }
    const entitlementTable = env.ECHO_ENTITLEMENTS_TABLE?.trim();
    if (entitlementTable && entitlementTable !== 'echo_entitlements') {
      throw new Error('Supabase payment order storage requires ECHO_ENTITLEMENTS_TABLE=echo_entitlements');
    }
    return new SupabasePaymentOrderStore(env);
  }
  throw new Error('ECHO_PAYMENT_ORDERS_STORE must be file or supabase');
}

function planFromEnv(
  id: PaymentPlanId,
  env: PaymentEnv,
  fallback: { name: string; amountCny: number; credits: number }
): PaymentPlan {
  const provider = paymentProvider(env);
  const prefix = id === 'plus' ? 'ECHO_PLUS' : 'ECHO_PRO';
  const paymentUrl =
    id === 'plus' ? env.ECHO_PLUS_PAYMENT_URL?.trim() || '' : env.ECHO_PRO_PAYMENT_URL?.trim() || '';
  const instructions =
    (id === 'plus' ? env.ECHO_PLUS_PAYMENT_INSTRUCTIONS : env.ECHO_PRO_PAYMENT_INSTRUCTIONS)?.trim() ||
    '测试期支付后人工确认开通额度。请保留订单号，付款后联系产品方。';

  return {
    id,
    name: fallback.name,
    amountCny: numberFromEnv(env[`${prefix}_PAYMENT_AMOUNT_CNY` as keyof PaymentEnv], fallback.amountCny),
    credits: intFromEnv(env[`${prefix}_PAYMENT_CREDITS` as keyof PaymentEnv], fallback.credits),
    paymentUrl,
    instructions,
    provider,
    enabled:
      provider === 'wechat_native'
        ? isWechatPaymentAutomationConfigured(env)
        : provider === 'alipay_page'
          ? isAlipayWebPayConfigured(env)
          : Boolean(paymentUrl),
  };
}

export function listPaymentPlans(env: PaymentEnv = process.env): PaymentPlan[] {
  return [
    planFromEnv('plus', env, { name: 'Plus', amountCny: 5, credits: 20 }),
    planFromEnv('pro', env, { name: 'Pro', amountCny: 12.9, credits: 60 }),
  ];
}

export async function createPaymentCheckout(
  input: { userId: string; planId: string; contact?: string | null },
  env: PaymentEnv = process.env,
  now = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env)
): Promise<PaymentCheckout> {
  const userId = input.userId.trim();
  if (!userId) throw new Error('userId is required');

  if (input.planId !== 'plus' && input.planId !== 'pro') {
    throw new Error('unknown plan');
  }

  const plan = listPaymentPlans(env).find((item) => item.id === input.planId);
  if (!plan || !plan.enabled) {
    throw new Error('payment plan is not available');
  }

  const timestamp = now.getTime();
  const id = `pay_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
  const provider = paymentProvider(env);
  let paymentUrl = plan.paymentUrl;
  let paymentFormHtml: string | undefined;
  if (provider === 'wechat_native') {
    paymentUrl = await createWechatNativePayment(
      {
        orderId: id,
        description: `Echo Map ${plan.name}`,
        amountFen: amountFen(plan.amountCny),
      },
      env
    );
  } else if (provider === 'alipay_page') {
    const alipayConfig = loadAlipayConfiguration(env);
    paymentFormHtml = createAlipayPageForm(alipayConfig, {
      orderId: id,
      amountCny: plan.amountCny.toFixed(2),
      subject: `Echo Map ${plan.name} credits`,
    });
    paymentUrl = '';
  }
  const order: PaymentOrder = {
    id,
    userId,
    planId: plan.id,
    planName: plan.name,
    amountCny: plan.amountCny,
    credits: plan.credits,
    status:
      provider === 'wechat_native'
        ? 'pending_wechat_payment'
        : provider === 'alipay_page'
          ? 'pending_alipay_payment'
          : 'pending_manual_confirmation',
    provider,
    paymentUrl,
    instructions: plan.instructions,
    contact: provider === 'alipay_page' ? null : input.contact?.trim() || null,
    confirmedAt: null,
    providerTransactionId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { order: await store.create(order), paymentFormHtml };
}

export async function createPaymentOrder(
  input: { userId: string; planId: string; contact?: string | null },
  env: PaymentEnv = process.env,
  now = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env)
): Promise<PaymentOrder> {
  return (await createPaymentCheckout(input, env, now, store)).order;
}

export async function confirmPaymentOrder(
  input: { orderId: string; amountFen?: number; providerTransactionId?: string | null },
  env: PaymentEnv = process.env,
  now = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env)
): Promise<PaymentOrder> {
  const orderId = input.orderId.trim();
  if (!orderId) throw new Error('orderId is required');
  const existing = await store.get(orderId);
  if (!existing) throw new Error('payment order not found');
  if (existing.provider === 'alipay_page') {
    throw new Error('Alipay orders can only be confirmed by a verified Alipay payment result');
  }
  return store.confirm({ ...input, orderId, provider: existing.provider }, now);
}

export async function getAlipayPaymentStatus(
  input: { userId: string; orderId: string },
  env: PaymentEnv = process.env,
  now = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env),
  queryTransaction: (
    orderId: string,
  ) => Promise<AlipayTransactionQueryResult> = (orderId) =>
    queryAlipayTransaction(loadAlipayConfiguration(env), orderId),
): Promise<{ order: PaymentOrder; providerStatus: AlipayTransactionQueryResult['status'] }> {
  const userId = input.userId.trim();
  const orderId = input.orderId.trim();
  if (!userId || !orderId) throw new Error('userId and orderId are required');

  const existing = await store.get(orderId);
  if (!existing || existing.userId !== userId) {
    throw new Error('payment order not found');
  }
  if (existing.provider !== 'alipay_page') {
    throw new Error('payment order does not use Alipay');
  }
  if (existing.status === 'confirmed') {
    return { order: existing, providerStatus: 'PAID' };
  }

  const transaction = await queryTransaction(orderId);
  if (transaction.orderId !== orderId) {
    throw new Error('Alipay transaction query order does not match the payment order');
  }
  if (transaction.status !== 'PAID') {
    return { order: existing, providerStatus: transaction.status };
  }
  if (!transaction.tradeNo) {
    throw new Error('Alipay transaction query is missing the trade number');
  }
  if (
    !transaction.totalAmount ||
    Math.round(Number(transaction.totalAmount) * 100) !== amountFen(existing.amountCny)
  ) {
    throw new Error('Alipay transaction query amount does not match the payment order');
  }

  const confirmed = await store.confirm(
    {
      orderId,
      amountFen: amountFen(existing.amountCny),
      providerTransactionId: transaction.tradeNo,
      provider: 'alipay_page',
    },
    now,
  );
  return { order: confirmed, providerStatus: 'PAID' };
}

export type AlipayReconciliationResult = {
  scanned: number;
  confirmed: number;
  pending: number;
  closed: number;
  notFound: number;
  failed: Array<{ orderId: string; error: string }>;
};

export async function reconcilePendingAlipayPayments(
  env: PaymentEnv = process.env,
  now = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env),
  queryTransaction?: (
    orderId: string,
  ) => Promise<AlipayTransactionQueryResult>,
): Promise<AlipayReconciliationResult> {
  const pendingOrders = await store.listPending('alipay_page');
  const result: AlipayReconciliationResult = {
    scanned: pendingOrders.length,
    confirmed: 0,
    pending: 0,
    closed: 0,
    notFound: 0,
    failed: [],
  };

  for (const order of pendingOrders) {
    try {
      const status = await getAlipayPaymentStatus(
        { userId: order.userId, orderId: order.id },
        env,
        now,
        store,
        queryTransaction,
      );
      if (status.order.status === 'confirmed') {
        result.confirmed += 1;
      } else if (status.providerStatus === 'CLOSED') {
        result.closed += 1;
      } else if (status.providerStatus === 'NOT_FOUND') {
        result.notFound += 1;
      } else {
        result.pending += 1;
      }
    } catch (error) {
      result.failed.push({
        orderId: order.id,
        error: error instanceof Error ? error.message : 'unable to reconcile payment order',
      });
    }
  }

  return result;
}

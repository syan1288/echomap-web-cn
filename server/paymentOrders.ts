import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { grantExtraCredits, type EntitlementEnv } from './entitlements.js';
import { getBearerToken, type HeaderLike } from './authUser.js';
import { createWechatNativePayment, isWechatNativePaymentConfigured, type WechatPayNativeEnv } from './wechatPayNative.js';

export type PaymentPlanId = 'plus' | 'pro';
export type PaymentProvider = 'manual' | 'wechat_native';

export type PaymentEnv = EntitlementEnv & WechatPayNativeEnv & {
  ECHO_PAYMENT_PROVIDER?: string;
  ECHO_PAYMENT_ADMIN_KEY?: string;
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
  status: 'pending_manual_confirmation' | 'pending_wechat_payment' | 'confirmed';
  provider: PaymentProvider;
  paymentUrl: string;
  instructions: string;
  contact: string | null;
  confirmedAt?: string | null;
  providerTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentOrderStore = {
  orders: Record<string, PaymentOrder>;
};

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
  return env.ECHO_PAYMENT_PROVIDER?.trim() === 'wechat_native' ? 'wechat_native' : 'manual';
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
    return { orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {} };
  } catch {
    return { orders: {} };
  }
}

function writeStore(env: PaymentEnv, store: PaymentOrderStore): void {
  const filePath = ordersPath(env);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, filePath);
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
    enabled: provider === 'wechat_native' ? isWechatPaymentAutomationConfigured(env) : Boolean(paymentUrl),
  };
}

export function listPaymentPlans(env: PaymentEnv = process.env): PaymentPlan[] {
  return [
    planFromEnv('plus', env, { name: 'Plus', amountCny: 5, credits: 20 }),
    planFromEnv('pro', env, { name: 'Pro', amountCny: 12.9, credits: 60 }),
  ];
}

export async function createPaymentOrder(
  input: { userId: string; planId: string; contact?: string | null },
  env: PaymentEnv = process.env,
  now = new Date()
): Promise<PaymentOrder> {
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
  const paymentUrl =
    provider === 'wechat_native'
      ? await createWechatNativePayment(
          {
            orderId: id,
            description: `Echo Map ${plan.name}`,
            amountFen: amountFen(plan.amountCny),
          },
          env
        )
      : plan.paymentUrl;
  const order: PaymentOrder = {
    id,
    userId,
    planId: plan.id,
    planName: plan.name,
    amountCny: plan.amountCny,
    credits: plan.credits,
    status: provider === 'wechat_native' ? 'pending_wechat_payment' : 'pending_manual_confirmation',
    provider,
    paymentUrl,
    instructions: plan.instructions,
    contact: input.contact?.trim() || null,
    confirmedAt: null,
    providerTransactionId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const store = readStore(env);
  store.orders[order.id] = order;
  writeStore(env, store);
  return order;
}

export async function confirmPaymentOrder(
  input: { orderId: string; amountFen?: number; providerTransactionId?: string | null },
  env: PaymentEnv = process.env,
  now = new Date()
): Promise<PaymentOrder> {
  const orderId = input.orderId.trim();
  if (!orderId) throw new Error('orderId is required');

  const store = readStore(env);
  const existing = store.orders[orderId];
  if (!existing) throw new Error('payment order not found');

  if (input.amountFen != null && input.amountFen !== amountFen(existing.amountCny)) {
    throw new Error('payment amount mismatch');
  }

  if (existing.status === 'confirmed') {
    return existing;
  }

  await grantExtraCredits(existing.userId, existing.credits, env, now);

  const confirmed: PaymentOrder = {
    ...existing,
    status: 'confirmed',
    confirmedAt: now.toISOString(),
    providerTransactionId: input.providerTransactionId?.trim() || existing.providerTransactionId || null,
    updatedAt: now.toISOString(),
  };
  store.orders[orderId] = confirmed;
  writeStore(env, store);
  return confirmed;
}

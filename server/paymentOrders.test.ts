import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  confirmPaymentOrder,
  createPaymentOrder,
  createPaymentOrderStore,
  listPaymentPlans,
  reconcilePendingAlipayPayments,
  SupabasePaymentOrderStore,
  type PaymentOrder,
  type PaymentEnv,
} from './paymentOrders.js';
import { getGenerationEntitlement } from './entitlements.js';

function testEnv(dir: string, overrides: Partial<PaymentEnv> = {}): PaymentEnv {
  return {
    ECHO_PAYMENT_ORDERS_PATH: path.join(dir, 'payment-orders.json'),
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_PLUS_PAYMENT_URL: 'https://pay.example.com/plus',
    ECHO_PRO_PAYMENT_URL: 'https://pay.example.com/pro',
    ECHO_FREE_STARTER_GENERATIONS: '0',
    ECHO_FREE_MONTHLY_GENERATIONS: '0',
    ...overrides,
  };
}

test('listPaymentPlans exposes configured manual payment plans', () => {
  const plans = listPaymentPlans(testEnv('unused'));

  assert.deepEqual(
    plans.map((plan) => ({
      id: plan.id,
      amountCny: plan.amountCny,
      credits: plan.credits,
      enabled: plan.enabled,
    })),
    [
      { id: 'plus', amountCny: 5, credits: 20, enabled: true },
      { id: 'pro', amountCny: 12.9, credits: 60, enabled: true },
    ]
  );
});

test('createPaymentOrder writes a pending manual order', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    const order = await createPaymentOrder(
      {
        userId: 'user_payment',
        planId: 'plus',
        contact: 'buyer@example.com',
      },
      testEnv(dir)
    );

    assert.match(order.id, /^pay_\d+_[a-z0-9]+$/);
    assert.equal(order.userId, 'user_payment');
    assert.equal(order.planId, 'plus');
    assert.equal(order.status, 'pending_manual_confirmation');
    assert.equal(order.credits, 20);
    assert.equal(order.paymentUrl, 'https://pay.example.com/plus');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createPaymentOrder rejects disabled or unknown plans', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    await assert.rejects(
      () => createPaymentOrder({ userId: 'user_payment', planId: 'plus' }, testEnv(dir, { ECHO_PLUS_PAYMENT_URL: '' })),
      /not available/
    );
    await assert.rejects(
      () => createPaymentOrder({ userId: 'user_payment', planId: 'enterprise' }, testEnv(dir)),
      /unknown plan/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent confirmations for separate orders preserve both credit grants', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    const env = testEnv(dir);
    const now = new Date('2026-11-19T00:00:00.000Z');
    const first = await createPaymentOrder({ userId: 'user_concurrent', planId: 'plus' }, env, now);
    const second = await createPaymentOrder({ userId: 'user_concurrent', planId: 'plus' }, env, now);

    await Promise.all([
      confirmPaymentOrder({ orderId: first.id, amountFen: 500 }, env, now),
      confirmPaymentOrder({ orderId: second.id, amountFen: 500 }, env, now),
    ]);

    const entitlement = await getGenerationEntitlement('user_concurrent', env, now);
    assert.equal(entitlement.allowed, true);
    assert.equal(entitlement.periodKey, 'extra');
    assert.equal(entitlement.remaining, 40);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('background Alipay reconciliation confirms paid pending orders and grants credits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-reconcile-'));
  try {
    const env = testEnv(dir, { ECHO_PAYMENT_PROVIDER: 'alipay_page' });
    const store = createPaymentOrderStore(env);
    const order: PaymentOrder = {
      id: 'pay_reconcile_1',
      userId: 'user_reconcile',
      planId: 'plus',
      planName: 'Plus',
      amountCny: 5,
      credits: 20,
      status: 'pending_alipay_payment',
      provider: 'alipay_page',
      paymentUrl: '',
      instructions: 'Pay in Alipay.',
      contact: null,
      confirmedAt: null,
      providerTransactionId: null,
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
    };
    await store.create(order);

    const result = await reconcilePendingAlipayPayments(
      env,
      new Date('2026-11-19T00:05:00.000Z'),
      store,
      async () => ({
        status: 'PAID',
        orderId: order.id,
        tradeNo: 'trade_reconcile_1',
        totalAmount: '5.00',
      }),
    );

    assert.deepEqual(result, {
      scanned: 1,
      confirmed: 1,
      pending: 0,
      closed: 0,
      notFound: 0,
      failed: [],
    });
    const confirmed = await store.get(order.id);
    assert.equal(confirmed?.status, 'confirmed');
    const entitlement = await getGenerationEntitlement(order.userId, env);
    assert.equal(entitlement.remaining, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Supabase payment store persists orders and confirms through the atomic database function', async () => {
  const calls: Array<{ kind: string; name: string; value: unknown }> = [];
  const row = {
    id: 'pay_supabase_1',
    user_id: '00000000-0000-4000-8000-000000000001',
    plan_id: 'plus',
    plan_name: 'Plus',
    amount_cny: '5.00',
    credits: 20,
    status: 'pending_manual_confirmation',
    provider: 'manual',
    payment_url: 'https://pay.example.com/plus',
    instructions: 'Keep the order ID.',
    contact: null,
    confirmed_at: null,
    provider_transaction_id: null,
    created_at: '2026-11-19T00:00:00.000Z',
    updated_at: '2026-11-19T00:00:00.000Z',
  };
  const client = {
    from(table: string) {
      return {
        insert(value: unknown) {
          calls.push({ kind: 'insert', name: table, value });
          return {
            select() {
              return this;
            },
            async single() {
              return { data: row, error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, value: unknown) {
      calls.push({ kind: 'rpc', name, value });
      return { data: { ...row, status: 'confirmed', confirmed_at: '2026-11-19T00:01:00.000Z' }, error: null };
    },
  };
  const store = new SupabasePaymentOrderStore(
    {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test_key',
    },
    client as never
  );
  const order: PaymentOrder = {
    id: row.id,
    userId: row.user_id,
    planId: 'plus',
    planName: 'Plus',
    amountCny: 5,
    credits: 20,
    status: 'pending_manual_confirmation',
    provider: 'manual',
    paymentUrl: row.payment_url,
    instructions: row.instructions,
    contact: null,
    confirmedAt: null,
    providerTransactionId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const created = await store.create(order);
  const confirmed = await store.confirm(
    { orderId: order.id, amountFen: 500, providerTransactionId: 'trade-001' },
    new Date('2026-11-19T00:01:00.000Z')
  );

  assert.equal(created.userId, order.userId);
  assert.equal(created.amountCny, 5);
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(calls, [
    {
      kind: 'insert',
      name: 'payment_orders',
      value: {
        id: order.id,
        user_id: order.userId,
        plan_id: 'plus',
        plan_name: 'Plus',
        amount_cny: 5,
        credits: 20,
        status: 'pending_manual_confirmation',
        provider: 'manual',
        payment_url: order.paymentUrl,
        instructions: order.instructions,
        contact: null,
        confirmed_at: null,
        provider_transaction_id: null,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      },
    },
    {
      kind: 'rpc',
      name: 'confirm_payment_order',
      value: {
        p_order_id: order.id,
        p_amount_fen: 500,
        p_provider_transaction_id: 'trade-001',
        p_confirmed_at: '2026-11-19T00:01:00.000Z',
      },
    },
  ]);
});

test('Supabase payment order storage cannot be selected without Supabase entitlement storage', () => {
  assert.throws(
    () =>
      createPaymentOrderStore({
        ECHO_PAYMENT_ORDERS_STORE: 'supabase',
        ECHO_ENTITLEMENTS_STORE: 'file',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_test_key',
      }),
    /requires ECHO_ENTITLEMENTS_STORE=supabase/
  );

  const store = createPaymentOrderStore({
    ECHO_PAYMENT_ORDERS_STORE: 'supabase',
    ECHO_ENTITLEMENTS_STORE: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  });
  assert.ok(store instanceof SupabasePaymentOrderStore);
  assert.throws(
    () =>
      createPaymentOrderStore({
        ECHO_PAYMENT_ORDERS_STORE: 'supabase',
        ECHO_ENTITLEMENTS_STORE: 'supabase',
        ECHO_ENTITLEMENTS_TABLE: 'custom_entitlements',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_test_key',
      }),
    /requires ECHO_ENTITLEMENTS_TABLE=echo_entitlements/
  );
});

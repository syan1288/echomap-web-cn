import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { confirmPaymentOrder, createPaymentOrder, listPaymentPlans, type PaymentEnv } from './paymentOrders.js';
import { getGenerationEntitlement, type EntitlementEnv } from './entitlements.js';

function testEnv(dir: string, overrides: Partial<PaymentEnv> = {}): PaymentEnv {
  return {
    ECHO_PAYMENT_ORDERS_PATH: path.join(dir, 'payment-orders.json'),
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_STARTER_GENERATIONS: '0',
    ECHO_FREE_MONTHLY_GENERATIONS: '0',
    ECHO_PLUS_PAYMENT_URL: 'https://pay.example.com/plus',
    ECHO_PRO_PAYMENT_URL: 'https://pay.example.com/pro',
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

test('createPaymentOrder can create a WeChat Native payment order', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  const originalFetch = globalThis.fetch;
  try {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), 'https://api.mch.weixin.qq.com/v3/pay/transactions/native');
      assert.equal(init?.method, 'POST');
      assert.match(String(init?.headers instanceof Headers ? init.headers.get('Authorization') : (init?.headers as Record<string, string>)?.Authorization), /^WECHATPAY2-SHA256-RSA2048 /);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.mchid, '1900000001');
      assert.equal(body.description, 'Echo Map Plus');
      assert.equal((body.amount as { total: number }).total, 500);
      return new Response(JSON.stringify({ code_url: 'weixin://wxpay/bizpayurl?pr=test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const order = await createPaymentOrder(
      {
        userId: 'wechat_user',
        planId: 'plus',
      },
      testEnv(dir, {
        ECHO_PAYMENT_PROVIDER: 'wechat_native',
        ECHO_PLUS_PAYMENT_URL: '',
        ECHO_PRO_PAYMENT_URL: '',
        WECHAT_PAY_APPID: 'wx_app',
        WECHAT_PAY_MCHID: '1900000001',
        WECHAT_PAY_MERCHANT_SERIAL_NO: 'merchant_serial',
        WECHAT_PAY_MERCHANT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        WECHAT_PAY_NOTIFY_URL: 'https://echomap.syan12.cn/api/payments/wechat/notify',
        WECHAT_PAY_API_V3_KEY: '12345678901234567890123456789012',
        WECHAT_PAY_PLATFORM_SERIAL_NO: 'platform_serial',
        WECHAT_PAY_PLATFORM_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nplaceholder\n-----END PUBLIC KEY-----',
      })
    );

    assert.equal(order.status, 'pending_wechat_payment');
    assert.equal(order.provider, 'wechat_native');
    assert.equal(order.paymentUrl, 'weixin://wxpay/bizpayurl?pr=test');
  } finally {
    globalThis.fetch = originalFetch;
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

test('confirmPaymentOrder grants purchased credits once', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    const env = testEnv(dir);
    const order = await createPaymentOrder(
      {
        userId: 'user_paid',
        planId: 'plus',
      },
      env
    );

    const confirmed = await confirmPaymentOrder(
      {
        orderId: order.id,
        amountFen: 500,
        providerTransactionId: 'wx_tx_001',
      },
      env
    );
    const confirmedAgain = await confirmPaymentOrder(
      {
        orderId: order.id,
        amountFen: 500,
        providerTransactionId: 'wx_tx_001',
      },
      env
    );
    const entitlement = await getGenerationEntitlement('user_paid', env as EntitlementEnv);

    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.providerTransactionId, 'wx_tx_001');
    assert.equal(confirmedAgain.status, 'confirmed');
    assert.equal(entitlement.allowed, true);
    assert.equal(entitlement.periodKey, 'extra');
    assert.equal(entitlement.remaining, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('confirmPaymentOrder rejects amount mismatches', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-payment-orders-'));
  try {
    const env = testEnv(dir);
    const order = await createPaymentOrder({ userId: 'user_paid', planId: 'pro' }, env);

    await assert.rejects(
      () => confirmPaymentOrder({ orderId: order.id, amountFen: 500, providerTransactionId: 'wx_tx_002' }, env),
      /amount mismatch/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

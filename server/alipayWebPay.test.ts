import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createAlipayPageForm,
  closeAlipayTransaction,
  loadAlipayConfiguration,
  queryAlipayTransaction,
  queryAlipayRefund,
  refundAlipayTransaction,
} from './alipayWebPay.js';
import {
  createPaymentCheckout,
  getAlipayPaymentStatus,
  type PaymentEnv,
} from './paymentOrders.js';
import { createEntitlementStore } from './entitlements.js';

function testKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const rawKey = (value: string) =>
    value.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '');

  return { privateKey: rawKey(privateKey), publicKey: rawKey(publicKey) };
}

test('sandbox Alipay configuration selects the Node.js private-key field without exposing values', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'echo-alipay-config-'));
  const keys = testKeyPair();
  try {
    writeFileSync(
      path.join(projectRoot, '.alipay-sandbox.json'),
      JSON.stringify({
        appIds: [{
          appId: 'sandbox-app-id',
          appPrivatePkcsKey: keys.privateKey,
          alipayPublicKey: keys.publicKey,
          pid: 'sandbox-seller-id',
        }],
        sandboxAccounts: {
          partner: {
            userId: 'sandbox-seller-id',
            email: 'seller@example.test',
          },
        },
      }),
      { mode: 0o600 },
    );

    const config = loadAlipayConfiguration(
      {
        ALIPAY_ENV: 'sandbox',
        ALIPAY_RETURN_URL: 'https://example.test/payment/return',
      },
      projectRoot,
    );

    assert.equal(config.appId, 'sandbox-app-id');
    assert.equal(config.privateKey, keys.privateKey);
    assert.equal(config.alipayPublicKey, keys.publicKey);
    assert.equal(config.sellerId, 'sandbox-seller-id');
    assert.equal(config.gateway, 'https://openapi-sandbox.dl.alipaydev.com/gateway.do');
    assert.equal(config.returnUrl, 'https://example.test/payment/return');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Alipay page checkout produces a POST form for the exact amount and order', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'echo-alipay-order-'));
  const keys = testKeyPair();
  const env: PaymentEnv = {
    ECHO_PAYMENT_PROVIDER: 'alipay_page',
    ECHO_PAYMENT_ORDERS_PATH: path.join(projectRoot, 'payment-orders.json'),
    ECHO_PLUS_PAYMENT_AMOUNT_CNY: '5',
    ECHO_PLUS_PAYMENT_CREDITS: '20',
    ALIPAY_ENV: 'production',
    ALIPAY_APP_ID: 'test-app-id',
    ALIPAY_APP_PRIVATE_KEY: keys.privateKey,
    ALIPAY_PUBLIC_KEY: keys.publicKey,
    ALIPAY_SELLER_ID: 'test-seller-id',
    ALIPAY_RETURN_URL: 'https://example.test/payment/return',
  };

  try {
    const checkout = await createPaymentCheckout(
      { userId: 'user_alipay', planId: 'plus', contact: 'not-needed@example.test' },
      env,
      new Date('2026-11-19T00:00:00.000Z'),
    );

    assert.match(checkout.order.id, /^pay_1795046400000_[a-z0-9]+$/u);
    assert.equal(checkout.order.provider, 'alipay_page');
    assert.equal(checkout.order.status, 'pending_alipay_payment');
    assert.equal(checkout.order.paymentUrl, '');
    assert.equal(checkout.order.contact, null);
    assert.match(checkout.paymentFormHtml, /<form/u);
    assert.match(checkout.paymentFormHtml, /method="post"/u);
    assert.match(checkout.paymentFormHtml, /alipay\.trade\.page\.pay/u);
    assert.match(checkout.paymentFormHtml, /FAST_INSTANT_TRADE_PAY/u);
    assert.match(checkout.paymentFormHtml, /pay_1795046400000_/u);
    assert.doesNotMatch(
      (await import('node:fs')).readFileSync(env.ECHO_PAYMENT_ORDERS_PATH!, 'utf8'),
      /paymentFormHtml|BEGIN RSA PRIVATE KEY/u,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Alipay page form uses the SDK pageExec POST flow and includes the return URL', () => {
  const keys = testKeyPair();
  const html = createAlipayPageForm(
    {
      environment: 'production',
      appId: 'test-app-id',
      privateKey: keys.privateKey,
      alipayPublicKey: keys.publicKey,
      sellerId: 'test-seller-id',
      gateway: 'https://openapi.alipay.com/gateway.do',
      returnUrl: 'https://example.test/payment/return',
      notifyUrl: null,
    },
    {
      orderId: 'pay_test_123',
      amountCny: '12.90',
      subject: 'Echo Map Pro',
    },
  );

  assert.match(html, /<form/u);
  assert.match(html, /method="post"/u);
  assert.match(html, /alipay\.trade\.page\.pay/u);
  assert.match(html, /pay_test_123/u);
  assert.match(html, /12\.90/u);
  assert.match(html, /FAST_INSTANT_TRADE_PAY/u);
  assert.match(html, /example\.test/u);
});

test('Alipay transaction query verifies the signed response and maps paid status', async () => {
  const keys = testKeyPair();
  const configuration = {
    environment: 'production' as const,
    appId: 'test-app-id',
    privateKey: keys.privateKey,
    alipayPublicKey: keys.publicKey,
    sellerId: 'test-seller-id',
    sellerEmail: null,
    gateway: 'https://openapi.alipay.com/gateway.do',
    returnUrl: 'https://example.test/payment/return',
    notifyUrl: null,
  };
  let received: { method: string; params: unknown; options: unknown } | undefined;
  const sdk = {
    async exec(method: string, params: unknown, options: unknown) {
      received = { method, params, options };
      return {
        code: '10000',
        trade_status: 'TRADE_SUCCESS',
        out_trade_no: 'pay_query_1',
        trade_no: 'alipay-trade-query-1',
        app_id: 'test-app-id',
        seller_id: 'test-seller-id',
        total_amount: '5.00',
      };
    },
  };

  const result = await queryAlipayTransaction(configuration, 'pay_query_1', sdk as never);

  assert.deepEqual(received, {
    method: 'alipay.trade.query',
    params: { bizContent: { outTradeNo: 'pay_query_1' } },
    options: { validateSign: true },
  });
  assert.equal(result.status, 'PAID');
  assert.equal(result.tradeNo, 'alipay-trade-query-1');
  assert.equal(result.totalAmount, '5.00');
});

test('Alipay transaction query does not accept a response for a different order', async () => {
  const keys = testKeyPair();
  const configuration = {
    environment: 'production' as const,
    appId: 'test-app-id',
    privateKey: keys.privateKey,
    alipayPublicKey: keys.publicKey,
    sellerId: 'test-seller-id',
    sellerEmail: null,
    gateway: 'https://openapi.alipay.com/gateway.do',
    returnUrl: 'https://example.test/payment/return',
    notifyUrl: null,
  };
  const sdk = {
    async exec() {
      return {
        code: '10000',
        trade_status: 'TRADE_SUCCESS',
        out_trade_no: 'another-order',
        trade_no: 'alipay-trade-query-2',
        app_id: 'test-app-id',
        seller_id: 'test-seller-id',
        total_amount: '5.00',
      };
    },
  };

  await assert.rejects(
    () => queryAlipayTransaction(configuration, 'pay_query_2', sdk as never),
    /order/u,
  );
});

test('an authenticated Alipay status check grants credits only after a matching paid result', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'echo-alipay-status-'));
  const keys = testKeyPair();
  const env: PaymentEnv = {
    ECHO_PAYMENT_PROVIDER: 'alipay_page',
    ECHO_PAYMENT_ORDERS_PATH: path.join(projectRoot, 'payment-orders.json'),
    ECHO_ENTITLEMENTS_STORE: 'file',
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(projectRoot, 'entitlements.json'),
    ECHO_PLUS_PAYMENT_AMOUNT_CNY: '5',
    ECHO_PLUS_PAYMENT_CREDITS: '20',
    ALIPAY_ENV: 'production',
    ALIPAY_APP_ID: 'test-app-id',
    ALIPAY_APP_PRIVATE_KEY: keys.privateKey,
    ALIPAY_PUBLIC_KEY: keys.publicKey,
    ALIPAY_SELLER_ID: 'test-seller-id',
    ALIPAY_RETURN_URL: 'https://example.test/payment/return',
  };

  try {
    const checkout = await createPaymentCheckout(
      { userId: 'user_status_owner', planId: 'plus' },
      env,
      new Date('2026-11-19T00:00:00.000Z'),
    );

    const result = await getAlipayPaymentStatus(
      { userId: 'user_status_owner', orderId: checkout.order.id },
      env,
      new Date('2026-11-19T00:01:00.000Z'),
      undefined,
      async (orderId) => ({
        status: 'PAID',
        orderId,
        tradeNo: 'alipay-status-trade-1',
        totalAmount: '5.00',
      }),
    );

    assert.equal(result.order.status, 'confirmed');
    assert.equal(result.order.providerTransactionId, 'alipay-status-trade-1');
    assert.equal(result.providerStatus, 'PAID');
    assert.equal(
      (await createEntitlementStore(env).readUser('user_status_owner'))?.extraCredits,
      20,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('an Alipay status check cannot disclose or confirm another user’s order', async () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'echo-alipay-owner-'));
  const keys = testKeyPair();
  const env: PaymentEnv = {
    ECHO_PAYMENT_PROVIDER: 'alipay_page',
    ECHO_PAYMENT_ORDERS_PATH: path.join(projectRoot, 'payment-orders.json'),
    ECHO_PLUS_PAYMENT_AMOUNT_CNY: '5',
    ECHO_PLUS_PAYMENT_CREDITS: '20',
    ALIPAY_ENV: 'production',
    ALIPAY_APP_ID: 'test-app-id',
    ALIPAY_APP_PRIVATE_KEY: keys.privateKey,
    ALIPAY_PUBLIC_KEY: keys.publicKey,
    ALIPAY_SELLER_ID: 'test-seller-id',
    ALIPAY_RETURN_URL: 'https://example.test/payment/return',
  };

  try {
    const checkout = await createPaymentCheckout(
      { userId: 'actual_owner', planId: 'plus' },
      env,
      new Date('2026-11-19T00:00:00.000Z'),
    );
    let queried = false;

    await assert.rejects(
      () =>
        getAlipayPaymentStatus(
          { userId: 'different_user', orderId: checkout.order.id },
          env,
          new Date(),
          undefined,
          async (orderId) => {
            queried = true;
            return {
              status: 'PAID',
              orderId,
              tradeNo: 'alipay-status-trade-2',
              totalAmount: '5.00',
            };
          },
        ),
      /payment order not found/u,
    );
    assert.equal(queried, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Alipay refund, refund query, and close operations use signed SDK calls with stable identifiers', async () => {
  const keys = testKeyPair();
  const configuration = {
    environment: 'production' as const,
    appId: 'test-app-id',
    privateKey: keys.privateKey,
    alipayPublicKey: keys.publicKey,
    sellerId: 'test-seller-id',
    sellerEmail: null,
    gateway: 'https://openapi.alipay.com/gateway.do',
    returnUrl: 'https://example.test/payment/return',
    notifyUrl: null,
  };
  const calls: Array<{ method: string; params: unknown; options: unknown }> = [];
  const sdk = {
    async exec(method: string, params: unknown, options: unknown) {
      calls.push({ method, params, options });
      return {
        code: '10000',
        out_trade_no: 'pay_refund_1',
        app_id: 'test-app-id',
        seller_id: 'test-seller-id',
        trade_no: 'alipay-trade-refund-1',
        refund_amount: '5.00',
      };
    },
  };

  const refunded = await refundAlipayTransaction(
    configuration,
    {
      orderId: 'pay_refund_1',
      refundAmountCny: '5.00',
      refundRequestId: 'refund-request-1',
      reason: 'test refund',
    },
    sdk as never,
  );
  const refundQuery = await queryAlipayRefund(
    configuration,
    { orderId: 'pay_refund_1', refundRequestId: 'refund-request-1' },
    sdk as never,
  );
  const closed = await closeAlipayTransaction(configuration, 'pay_refund_1', sdk as never);

  assert.equal(refunded.refundAmountCny, '5.00');
  assert.equal(refundQuery.refundAmountCny, '5.00');
  assert.equal(closed.orderId, 'pay_refund_1');
  assert.deepEqual(calls.map((call) => call.method), [
    'alipay.trade.refund',
    'alipay.trade.fastpay.refund.query',
    'alipay.trade.close',
  ]);
  assert.ok(calls.every((call) => (call.options as { validateSign?: boolean }).validateSign));
  assert.deepEqual(calls[0]?.params, {
    bizContent: {
      outTradeNo: 'pay_refund_1',
      refundAmount: '5.00',
      outRequestNo: 'refund-request-1',
      refundReason: 'test refund',
    },
  });
});

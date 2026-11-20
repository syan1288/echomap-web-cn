import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleAlipayNotification } from './alipayNotify.js';
import { getGenerationEntitlement } from './entitlements.js';
import { createPaymentCheckout, type PaymentEnv } from './paymentOrders.js';

function createTestKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const raw = (value: string) => value.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '');
  return { privateKey: raw(privateKey), publicKey: raw(publicKey) };
}

function signNotify(
  params: Record<string, string>,
  privateKey: string,
): Record<string, string> {
  const content = Object.keys(params)
    .filter((key) => key !== 'sign')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const signer = createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  return { ...params, sign: signer.sign(`-----BEGIN RSA PRIVATE KEY-----\n${privateKey}\n-----END RSA PRIVATE KEY-----`, 'base64') };
}

function testEnv(dir: string): { env: PaymentEnv; privateKey: string } {
  const keys = createTestKeys();
  return {
    privateKey: keys.privateKey,
    env: {
    ECHO_PAYMENT_PROVIDER: 'alipay_page',
    ECHO_PAYMENT_ORDERS_PATH: path.join(dir, 'payment-orders.json'),
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_STARTER_GENERATIONS: '0',
    ECHO_FREE_MONTHLY_GENERATIONS: '0',
    ECHO_PAYMENT_ORDERS_STORE: 'file',
    ALIPAY_ENV: 'production',
    ALIPAY_APP_ID: 'test-app-id',
    ALIPAY_APP_PRIVATE_KEY: keys.privateKey,
    ALIPAY_PUBLIC_KEY: keys.publicKey,
    ALIPAY_SELLER_ID: 'test-seller-id',
    ALIPAY_RETURN_URL: 'https://example.test/payment/return',
    },
  };
}

test('a verified Alipay success notification grants credits once despite retries', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-alipay-notify-'));
  try {
    const { env, privateKey } = testEnv(dir);
    const { order } = await createPaymentCheckout(
      { userId: 'user_alipay_notify', planId: 'plus' },
      env,
      new Date('2026-11-19T00:00:00.000Z'),
    );
    const params = signNotify(
      {
        notify_type: 'trade_status_sync',
        notify_id: 'notify-001',
        sign_type: 'RSA2',
        trade_no: 'alipay-trade-001',
        app_id: 'test-app-id',
        out_trade_no: order.id,
        trade_status: 'TRADE_SUCCESS',
        total_amount: '5.00',
        seller_id: 'test-seller-id',
      },
      privateKey,
    );

    await handleAlipayNotification(params, env, new Date('2026-11-19T00:01:00.000Z'));
    await handleAlipayNotification(params, env, new Date('2026-11-19T00:02:00.000Z'));

    const entitlement = await getGenerationEntitlement('user_alipay_notify', env);
    assert.equal(entitlement.allowed, true);
    assert.equal(entitlement.periodKey, 'extra');
    assert.equal(entitlement.remaining, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an altered Alipay notification cannot activate credits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-alipay-invalid-notify-'));
  try {
    const { env, privateKey } = testEnv(dir);
    const { order } = await createPaymentCheckout(
      { userId: 'user_alipay_invalid', planId: 'plus' },
      env,
      new Date('2026-11-19T00:00:00.000Z'),
    );
    const signed = signNotify(
      {
        notify_type: 'trade_status_sync',
        notify_id: 'notify-002',
        sign_type: 'RSA2',
        trade_no: 'alipay-trade-002',
        app_id: 'test-app-id',
        out_trade_no: order.id,
        trade_status: 'TRADE_SUCCESS',
        total_amount: '5.00',
        seller_id: 'test-seller-id',
      },
      privateKey,
    );

    await assert.rejects(
      () => handleAlipayNotification({ ...signed, total_amount: '0.01' }, env),
      /signature|amount/u,
    );

    const entitlement = await getGenerationEntitlement('user_alipay_invalid', env);
    assert.equal(entitlement.allowed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

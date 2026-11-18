import assert from 'node:assert/strict';
import { createCipheriv, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getGenerationEntitlement } from './entitlements.js';
import { createPaymentOrder } from './paymentOrders.js';
import { handleWechatPayNotify, type WechatPayNotifyEnv } from './wechatPayNotify.js';

function encryptResource(plain: Record<string, unknown>, apiV3Key: string) {
  const nonce = randomBytes(12).toString('hex').slice(0, 12);
  const associatedData = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce, 'utf8'));
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: 'AEAD_AES_256_GCM',
    nonce,
    associated_data: associatedData,
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
  };
}

function signedNotify(rawBody: string, privateKey: string, overrides: Record<string, string> = {}) {
  const timestamp = overrides.timestamp ?? '1779100000';
  const nonce = overrides.nonce ?? 'notify_nonce';
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const signature = createSign('RSA-SHA256').update(message, 'utf8').sign(privateKey, 'base64');
  return {
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'platform_serial',
    },
    rawBody,
  };
}

function testEnv(dir: string, publicKey: string, apiV3Key: string): WechatPayNotifyEnv {
  return {
    ECHO_PAYMENT_ORDERS_PATH: path.join(dir, 'payment-orders.json'),
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_STARTER_GENERATIONS: '0',
    ECHO_FREE_MONTHLY_GENERATIONS: '0',
    ECHO_PLUS_PAYMENT_URL: 'https://pay.example.com/plus',
    ECHO_PRO_PAYMENT_URL: 'https://pay.example.com/pro',
    WECHAT_PAY_API_V3_KEY: apiV3Key,
    WECHAT_PAY_PLATFORM_PUBLIC_KEY: publicKey,
    WECHAT_PAY_PLATFORM_SERIAL_NO: 'platform_serial',
  };
}

test('handleWechatPayNotify confirms a signed successful payment and grants credits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-wechat-notify-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const apiV3Key = '12345678901234567890123456789012';
    const env = testEnv(
      dir,
      publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      apiV3Key
    );
    const order = await createPaymentOrder({ userId: 'wechat_user', planId: 'plus' }, env);
    const resource = encryptResource(
      {
        out_trade_no: order.id,
        transaction_id: 'wx_transaction_001',
        trade_state: 'SUCCESS',
        amount: { total: 500, currency: 'CNY' },
      },
      apiV3Key
    );
    const rawBody = JSON.stringify({
      id: 'notify_001',
      event_type: 'TRANSACTION.SUCCESS',
      resource,
    });

    const result = await handleWechatPayNotify(
      signedNotify(rawBody, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
      env
    );
    const entitlement = await getGenerationEntitlement('wechat_user', env);

    assert.deepEqual(result, { code: 'SUCCESS', message: '成功' });
    assert.equal(entitlement.allowed, true);
    assert.equal(entitlement.periodKey, 'extra');
    assert.equal(entitlement.remaining, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleWechatPayNotify rejects invalid signatures before granting credits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-wechat-notify-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const apiV3Key = '12345678901234567890123456789012';
    const env = testEnv(
      dir,
      publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      apiV3Key
    );
    const order = await createPaymentOrder({ userId: 'wechat_user', planId: 'plus' }, env);
    const rawBody = JSON.stringify({
      id: 'notify_002',
      event_type: 'TRANSACTION.SUCCESS',
      resource: encryptResource(
        {
          out_trade_no: order.id,
          transaction_id: 'wx_transaction_002',
          trade_state: 'SUCCESS',
          amount: { total: 500, currency: 'CNY' },
        },
        apiV3Key
      ),
    });
    const notify = signedNotify(rawBody, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

    await assert.rejects(
      () => handleWechatPayNotify({ ...notify, rawBody: rawBody.replace('SUCCESS', 'FAIL') }, env),
      /invalid WeChat Pay signature/
    );
    const entitlement = await getGenerationEntitlement('wechat_user', env);

    assert.equal(entitlement.allowed, false);
    assert.equal(entitlement.reason, 'quota_exhausted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { createDecipheriv, createVerify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { confirmPaymentOrder, type PaymentEnv } from './paymentOrders.js';

export type WechatPayNotifyEnv = PaymentEnv & {
  WECHAT_PAY_API_V3_KEY?: string;
  WECHAT_PAY_PLATFORM_PUBLIC_KEY?: string;
  WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH?: string;
  WECHAT_PAY_PLATFORM_SERIAL_NO?: string;
};

export type WechatPayNotifyInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
};

export type WechatPayNotifyResult = {
  code: 'SUCCESS';
  message: '成功';
};

type WechatResource = {
  algorithm?: string;
  ciphertext?: string;
  associated_data?: string;
  nonce?: string;
};

type WechatNotification = {
  event_type?: string;
  resource?: WechatResource;
};

type WechatTransaction = {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: {
    total?: number;
  };
};

function headerValue(headers: WechatPayNotifyInput['headers'], name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    return Array.isArray(value) ? value[0] || '' : value || '';
  }
  return '';
}

function loadTextFromEnv(value: string | undefined, filePath: string | undefined): string {
  const inline = value?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');

  const explicitPath = filePath?.trim();
  if (explicitPath && existsSync(explicitPath)) {
    return readFileSync(explicitPath, 'utf8');
  }

  return '';
}

function getWechatApiV3Key(env: WechatPayNotifyEnv): Buffer {
  const key = env.WECHAT_PAY_API_V3_KEY?.trim() || '';
  const keyBuffer = Buffer.from(key, 'utf8');
  if (keyBuffer.length !== 32) {
    throw new Error('WECHAT_PAY_API_V3_KEY must be 32 bytes');
  }
  return keyBuffer;
}

function verifyWechatSignature(input: WechatPayNotifyInput, env: WechatPayNotifyEnv): void {
  const timestamp = headerValue(input.headers, 'wechatpay-timestamp');
  const nonce = headerValue(input.headers, 'wechatpay-nonce');
  const signature = headerValue(input.headers, 'wechatpay-signature');
  const serial = headerValue(input.headers, 'wechatpay-serial');
  if (!timestamp || !nonce || !signature || !serial) {
    throw new Error('missing WeChat Pay signature headers');
  }

  const expectedSerial = env.WECHAT_PAY_PLATFORM_SERIAL_NO?.trim();
  if (expectedSerial && serial !== expectedSerial) {
    throw new Error('unexpected WeChat Pay platform serial');
  }

  const publicKey = loadTextFromEnv(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY, env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH);
  if (!publicKey) {
    throw new Error('WECHAT_PAY_PLATFORM_PUBLIC_KEY is required');
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${timestamp}\n${nonce}\n${input.rawBody}\n`, 'utf8');
  verifier.end();
  if (!verifier.verify(publicKey, signature, 'base64')) {
    throw new Error('invalid WeChat Pay signature');
  }
}

function decryptWechatResource(resource: WechatResource, env: WechatPayNotifyEnv): WechatTransaction {
  if (resource.algorithm !== 'AEAD_AES_256_GCM') {
    throw new Error('unsupported WeChat Pay resource algorithm');
  }
  if (!resource.ciphertext || !resource.nonce) {
    throw new Error('invalid WeChat Pay resource');
  }

  const rawCiphertext = Buffer.from(resource.ciphertext, 'base64');
  if (rawCiphertext.length <= 16) {
    throw new Error('invalid WeChat Pay ciphertext');
  }

  const ciphertext = rawCiphertext.subarray(0, rawCiphertext.length - 16);
  const authTag = rawCiphertext.subarray(rawCiphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', getWechatApiV3Key(env), Buffer.from(resource.nonce, 'utf8'));
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }
  decipher.setAuthTag(authTag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as WechatTransaction;
}

export async function handleWechatPayNotify(
  input: WechatPayNotifyInput,
  env: WechatPayNotifyEnv = process.env
): Promise<WechatPayNotifyResult> {
  verifyWechatSignature(input, env);

  const notification = JSON.parse(input.rawBody) as WechatNotification;
  if (notification.event_type !== 'TRANSACTION.SUCCESS') {
    return { code: 'SUCCESS', message: '成功' };
  }

  if (!notification.resource) {
    throw new Error('missing WeChat Pay notification resource');
  }

  const transaction = decryptWechatResource(notification.resource, env);
  if (transaction.trade_state !== 'SUCCESS') {
    return { code: 'SUCCESS', message: '成功' };
  }

  const orderId = transaction.out_trade_no?.trim() || '';
  const amountFen = transaction.amount?.total;
  if (!orderId || typeof amountFen !== 'number') {
    throw new Error('invalid WeChat Pay transaction');
  }

  await confirmPaymentOrder(
    {
      orderId,
      amountFen,
      providerTransactionId: transaction.transaction_id || null,
    },
    env
  );

  return { code: 'SUCCESS', message: '成功' };
}

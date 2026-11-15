import { randomBytes, createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export type WechatPayNativeEnv = {
  WECHAT_PAY_APPID?: string;
  WECHAT_PAY_MCHID?: string;
  WECHAT_PAY_MERCHANT_SERIAL_NO?: string;
  WECHAT_PAY_MERCHANT_PRIVATE_KEY?: string;
  WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH?: string;
  WECHAT_PAY_NOTIFY_URL?: string;
};

type NativePaymentInput = {
  orderId: string;
  description: string;
  amountFen: number;
};

function requiredEnv(env: WechatPayNativeEnv, key: keyof WechatPayNativeEnv): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for WeChat Pay Native`);
  return value;
}

function loadMerchantPrivateKey(env: WechatPayNativeEnv): string {
  const inline = env.WECHAT_PAY_MERCHANT_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, '\n');

  const filePath = env.WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH?.trim();
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, 'utf8');
  }

  throw new Error('WECHAT_PAY_MERCHANT_PRIVATE_KEY is required for WeChat Pay Native');
}

export function isWechatNativePaymentConfigured(env: WechatPayNativeEnv): boolean {
  return Boolean(
    env.WECHAT_PAY_APPID?.trim() &&
      env.WECHAT_PAY_MCHID?.trim() &&
      env.WECHAT_PAY_MERCHANT_SERIAL_NO?.trim() &&
      (env.WECHAT_PAY_MERCHANT_PRIVATE_KEY?.trim() || env.WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH?.trim()) &&
      env.WECHAT_PAY_NOTIFY_URL?.trim()
  );
}

function buildWechatAuthorization(
  method: string,
  urlPath: string,
  body: string,
  env: WechatPayNativeEnv,
  now = new Date()
): string {
  const mchid = requiredEnv(env, 'WECHAT_PAY_MCHID');
  const serialNo = requiredEnv(env, 'WECHAT_PAY_MERCHANT_SERIAL_NO');
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = createSign('RSA-SHA256').update(message, 'utf8').sign(loadMerchantPrivateKey(env), 'base64');

  return [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${mchid}"`,
    `nonce_str="${nonce}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${serialNo}"`,
    `signature="${signature}"`,
  ].join(' ');
}

export async function createWechatNativePayment(
  input: NativePaymentInput,
  env: WechatPayNativeEnv = process.env
): Promise<string> {
  if (!Number.isInteger(input.amountFen) || input.amountFen <= 0) {
    throw new Error('amountFen must be a positive integer');
  }

  const urlPath = '/v3/pay/transactions/native';
  const body = JSON.stringify({
    appid: requiredEnv(env, 'WECHAT_PAY_APPID'),
    mchid: requiredEnv(env, 'WECHAT_PAY_MCHID'),
    description: input.description.slice(0, 127),
    out_trade_no: input.orderId,
    notify_url: requiredEnv(env, 'WECHAT_PAY_NOTIFY_URL'),
    amount: {
      total: input.amountFen,
      currency: 'CNY',
    },
  });

  const response = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
    method: 'POST',
    headers: {
      Authorization: buildWechatAuthorization('POST', urlPath, body, env),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WeChat Pay Native order failed: ${text || response.status}`);
  }

  const parsed = JSON.parse(text) as { code_url?: string };
  const codeUrl = parsed.code_url?.trim();
  if (!codeUrl) {
    throw new Error('WeChat Pay Native response missing code_url');
  }
  return codeUrl;
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AlipaySdk } from 'alipay-sdk';

export const ALIPAY_SANDBOX_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';
const ALIPAY_PRODUCTION_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export type AlipayEnvironment = 'sandbox' | 'production';

export type AlipayWebPayEnv = {
  ALIPAY_ENV?: string;
  ALIPAY_APP_ID?: string;
  ALIPAY_APP_PRIVATE_KEY?: string;
  ALIPAY_PUBLIC_KEY?: string;
  ALIPAY_SELLER_ID?: string;
  ALIPAY_SELLER_EMAIL?: string;
  ALIPAY_GATEWAY?: string;
  ALIPAY_NOTIFY_URL?: string;
  ALIPAY_RETURN_URL?: string;
};

export type AlipayWebPayConfiguration = {
  environment: AlipayEnvironment;
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  sellerId: string | null;
  sellerEmail?: string | null;
  gateway: string;
  returnUrl: string;
  notifyUrl: string | null;
};

export type AlipayPageOrderInput = {
  orderId: string;
  amountCny: string;
  subject: string;
};

export type AlipayTransactionQueryResult = {
  status: 'PAID' | 'WAIT_BUYER_PAY' | 'CLOSED' | 'NOT_FOUND';
  orderId: string;
  tradeNo: string | null;
  totalAmount: string | null;
};

type AlipayTradeClient = {
  exec(
    method: string,
    params: { bizContent: Record<string, string> },
    options: { validateSign: true },
  ): Promise<Record<string, unknown>>;
};

type SandboxApp = {
  appId?: unknown;
  appPrivatePkcsKey?: unknown;
  alipayPublicKey?: unknown;
  pid?: unknown;
};

type SandboxConfigurationFile = {
  appIds?: unknown;
  sandboxAccounts?: {
    partner?: {
      userId?: unknown;
      email?: unknown;
    };
  };
};

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required for Alipay web payments`);
  }
  return value.trim();
}
function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validatePaymentUrl(
  value: unknown,
  fieldName: string,
  environment: AlipayEnvironment,
  required: boolean,
): string | null {
  const text = optionalString(value);
  if (!text) {
    if (required) throw new Error(`${fieldName} is required for Alipay web payments`);
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${fieldName} must be an absolute HTTP(S) URL`);
  }

  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    (environment === 'production' && parsed.protocol !== 'https:')
  ) {
    throw new Error(`${fieldName} must use HTTPS in production and HTTP(S) in sandbox`);
  }

  return parsed.toString();
}

function projectRootFromModule(): string {
  return path.resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function sandboxConfiguration(
  env: AlipayWebPayEnv,
  projectRoot: string,
): AlipayWebPayConfiguration {
  let parsed: SandboxConfigurationFile;
  try {
    parsed = JSON.parse(
      readFileSync(path.join(projectRoot, '.alipay-sandbox.json'), 'utf8'),
    ) as SandboxConfigurationFile;
  } catch {
    throw new Error('Verified Alipay sandbox configuration is unavailable');
  }

  const apps = Array.isArray(parsed.appIds) ? parsed.appIds : [];
  const app = apps[0] as SandboxApp | undefined;
  if (!app) throw new Error('Verified Alipay sandbox application is unavailable');

  const seller = parsed.sandboxAccounts?.partner;
  const sellerId = optionalString(app.pid) ?? optionalString(seller?.userId);

  return {
    environment: 'sandbox',
    appId: requiredString(app.appId, 'Sandbox appId'),
    privateKey: requiredString(app.appPrivatePkcsKey, 'Sandbox appPrivatePkcsKey'),
    alipayPublicKey: requiredString(app.alipayPublicKey, 'Sandbox alipayPublicKey'),
    sellerId,
    sellerEmail: optionalString(seller?.email),
    gateway: ALIPAY_SANDBOX_GATEWAY,
    returnUrl: requiredString(
      validatePaymentUrl(env.ALIPAY_RETURN_URL, 'ALIPAY_RETURN_URL', 'sandbox', true),
      'ALIPAY_RETURN_URL',
    ),
    notifyUrl: validatePaymentUrl(
      env.ALIPAY_NOTIFY_URL,
      'ALIPAY_NOTIFY_URL',
      'sandbox',
      false,
    ),
  };
}

export function loadAlipayConfiguration(
  env: AlipayWebPayEnv = process.env,
  projectRoot = projectRootFromModule(),
): AlipayWebPayConfiguration {
  const requestedEnvironment = env.ALIPAY_ENV?.trim().toLowerCase() || 'production';
  if (requestedEnvironment === 'sandbox') {
    return sandboxConfiguration(env, projectRoot);
  }
  if (requestedEnvironment !== 'production') {
    throw new Error('ALIPAY_ENV must be sandbox or production');
  }

  const sellerId = optionalString(env.ALIPAY_SELLER_ID);
  const sellerEmail = optionalString(env.ALIPAY_SELLER_EMAIL);
  if (!sellerId && !sellerEmail) {
    throw new Error('ALIPAY_SELLER_ID or ALIPAY_SELLER_EMAIL is required for Alipay web payments');
  }

  return {
    environment: 'production',
    appId: requiredString(env.ALIPAY_APP_ID, 'ALIPAY_APP_ID'),
    privateKey: requiredString(env.ALIPAY_APP_PRIVATE_KEY, 'ALIPAY_APP_PRIVATE_KEY'),
    alipayPublicKey: requiredString(env.ALIPAY_PUBLIC_KEY, 'ALIPAY_PUBLIC_KEY'),
    sellerId,
    sellerEmail,
    gateway:
      optionalString(env.ALIPAY_GATEWAY) ??
      ALIPAY_PRODUCTION_GATEWAY,
    returnUrl: requiredString(
      validatePaymentUrl(env.ALIPAY_RETURN_URL, 'ALIPAY_RETURN_URL', 'production', true),
      'ALIPAY_RETURN_URL',
    ),
    notifyUrl: validatePaymentUrl(
      env.ALIPAY_NOTIFY_URL,
      'ALIPAY_NOTIFY_URL',
      'production',
      false,
    ),
  };
}

export function isAlipayWebPayConfigured(
  env: AlipayWebPayEnv = process.env,
): boolean {
  try {
    loadAlipayConfiguration(env);
    return true;
  } catch {
    return false;
  }
}

export function createAlipaySdk(configuration: AlipayWebPayConfiguration): AlipaySdk {
  return new AlipaySdk({
    appId: configuration.appId,
    privateKey: configuration.privateKey,
    alipayPublicKey: configuration.alipayPublicKey,
    gateway: configuration.gateway,
    signType: 'RSA2',
    keyType: 'PKCS1',
  });
}

export function createAlipayPageForm(
  configuration: AlipayWebPayConfiguration,
  order: AlipayPageOrderInput,
): string {
  const sdk = createAlipaySdk(configuration);
  const requestOptions: {
    returnUrl: string;
    notifyUrl?: string;
    bizContent: {
      outTradeNo: string;
      totalAmount: string;
      subject: string;
      productCode: 'FAST_INSTANT_TRADE_PAY';
    };
  } = {
    returnUrl: configuration.returnUrl,
    bizContent: {
      outTradeNo: order.orderId,
      totalAmount: order.amountCny,
      subject: order.subject,
      productCode: 'FAST_INSTANT_TRADE_PAY',
    },
  };

  if (configuration.notifyUrl) requestOptions.notifyUrl = configuration.notifyUrl;

  return sdk.pageExec('alipay.trade.page.pay', 'POST', requestOptions);
}

function queryResponseString(response: Record<string, unknown>, key: string): string {
  const value = response[key];
  return typeof value === 'string' ? value.trim() : '';
}

function queryResponseAmount(value: string): string {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/u.test(value)) {
    throw new Error('Alipay transaction query returned an invalid amount');
  }
  return Number(value).toFixed(2);
}

function querySellerMatches(
  response: Record<string, unknown>,
  configuration: AlipayWebPayConfiguration,
): boolean {
  const sellerId = queryResponseString(response, 'seller_id');
  const sellerEmail = queryResponseString(response, 'seller_email');
  if (configuration.sellerId && sellerId === configuration.sellerId) return true;
  return Boolean(
    configuration.sellerEmail &&
      sellerEmail &&
      sellerEmail.toLowerCase() === configuration.sellerEmail.toLowerCase(),
  );
}

export async function queryAlipayTransaction(
  configuration: AlipayWebPayConfiguration,
  orderId: string,
  client: AlipayTradeClient = createAlipaySdk(configuration),
): Promise<AlipayTransactionQueryResult> {
  const requestedOrderId = orderId.trim();
  if (!requestedOrderId) throw new Error('orderId is required');

  const response = await client.exec(
    'alipay.trade.query',
    { bizContent: { outTradeNo: requestedOrderId } },
    { validateSign: true },
  );
  const responseCode = queryResponseString(response, 'code');
  if (responseCode === '40004' && queryResponseString(response, 'sub_code') === 'ACQ.TRADE_NOT_EXIST') {
    return {
      status: 'NOT_FOUND',
      orderId: requestedOrderId,
      tradeNo: null,
      totalAmount: null,
    };
  }
  if (responseCode !== '10000') {
    throw new Error('Alipay transaction query was not successful');
  }

  const responseOrderId = queryResponseString(response, 'out_trade_no');
  if (responseOrderId !== requestedOrderId) {
    throw new Error('Alipay transaction query order does not match the requested order');
  }
  if (queryResponseString(response, 'app_id') !== configuration.appId) {
    throw new Error('Alipay transaction query application does not match local configuration');
  }
  if (
    (configuration.sellerId || configuration.sellerEmail) &&
    !querySellerMatches(response, configuration)
  ) {
    throw new Error('Alipay transaction query seller does not match local configuration');
  }

  const rawAmount = queryResponseString(response, 'total_amount');
  const totalAmount = queryResponseAmount(rawAmount);
  const tradeStatus = queryResponseString(response, 'trade_status');
  let status: AlipayTransactionQueryResult['status'];
  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    status = 'PAID';
  } else if (tradeStatus === 'WAIT_BUYER_PAY') {
    status = 'WAIT_BUYER_PAY';
  } else if (tradeStatus === 'TRADE_CLOSED') {
    status = 'CLOSED';
  } else {
    throw new Error('Alipay transaction query returned an unsupported trade status');
  }

  const tradeNo = queryResponseString(response, 'trade_no') || null;
  if (status === 'PAID' && !tradeNo) {
    throw new Error('Alipay transaction query is missing the trade number');
  }

  return { status, orderId: requestedOrderId, tradeNo, totalAmount };
}

function requiredTradeInput(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) throw new Error(`${name} is required`);
  return trimmed;
}

async function executeAlipayTrade(
  configuration: AlipayWebPayConfiguration,
  method: string,
  bizContent: Record<string, string>,
  client: AlipayTradeClient,
): Promise<Record<string, unknown>> {
  const response = await client.exec(method, { bizContent }, { validateSign: true });
  if (queryResponseString(response, 'code') !== '10000') {
    throw new Error(`Alipay operation failed: ${method}`);
  }
  const responseOrderId = queryResponseString(response, 'out_trade_no');
  if (responseOrderId && responseOrderId !== bizContent.outTradeNo) {
    throw new Error('Alipay operation order does not match the requested order');
  }
  const responseAppId = queryResponseString(response, 'app_id');
  if (responseAppId && responseAppId !== configuration.appId) {
    throw new Error('Alipay operation application does not match local configuration');
  }
  if (
    (configuration.sellerId || configuration.sellerEmail) &&
    (queryResponseString(response, 'seller_id') || queryResponseString(response, 'seller_email')) &&
    !querySellerMatches(response, configuration)
  ) {
    throw new Error('Alipay operation seller does not match local configuration');
  }
  return response;
}

export async function refundAlipayTransaction(
  configuration: AlipayWebPayConfiguration,
  input: {
    orderId: string;
    refundAmountCny: string;
    refundRequestId: string;
    reason?: string;
  },
  client: AlipayTradeClient = createAlipaySdk(configuration),
): Promise<{ orderId: string; refundRequestId: string; refundAmountCny: string; refundNo: string | null }> {
  const orderId = requiredTradeInput(input.orderId, 'orderId');
  const refundRequestId = requiredTradeInput(input.refundRequestId, 'refundRequestId');
  const refundAmountCny = queryResponseAmount(input.refundAmountCny.trim());
  if (Number(refundAmountCny) <= 0) throw new Error('refundAmountCny must be positive');
  const bizContent: Record<string, string> = {
    outTradeNo: orderId,
    refundAmount: refundAmountCny,
    outRequestNo: refundRequestId,
  };
  if (input.reason?.trim()) bizContent.refundReason = input.reason.trim().slice(0, 256);
  const response = await executeAlipayTrade(
    configuration,
    'alipay.trade.refund',
    bizContent,
    client,
  );
  return {
    orderId,
    refundRequestId,
    refundAmountCny,
    refundNo: queryResponseString(response, 'trade_no') || null,
  };
}

export async function queryAlipayRefund(
  configuration: AlipayWebPayConfiguration,
  input: { orderId: string; refundRequestId: string },
  client: AlipayTradeClient = createAlipaySdk(configuration),
): Promise<{ orderId: string; refundRequestId: string; refundAmountCny: string | null }> {
  const orderId = requiredTradeInput(input.orderId, 'orderId');
  const refundRequestId = requiredTradeInput(input.refundRequestId, 'refundRequestId');
  const response = await executeAlipayTrade(
    configuration,
    'alipay.trade.fastpay.refund.query',
    { outTradeNo: orderId, outRequestNo: refundRequestId },
    client,
  );
  const amount = queryResponseString(response, 'refund_amount');
  return {
    orderId,
    refundRequestId,
    refundAmountCny: amount ? queryResponseAmount(amount) : null,
  };
}

export async function closeAlipayTransaction(
  configuration: AlipayWebPayConfiguration,
  orderId: string,
  client: AlipayTradeClient = createAlipaySdk(configuration),
): Promise<{ orderId: string; tradeNo: string | null }> {
  const requestedOrderId = requiredTradeInput(orderId, 'orderId');
  const response = await executeAlipayTrade(
    configuration,
    'alipay.trade.close',
    { outTradeNo: requestedOrderId },
    client,
  );
  return {
    orderId: requestedOrderId,
    tradeNo: queryResponseString(response, 'trade_no') || null,
  };
}

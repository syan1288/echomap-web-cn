import {
  createAlipaySdk,
  loadAlipayConfiguration,
  type AlipayWebPayEnv,
} from './alipayWebPay.js';
import {
  createPaymentOrderStore,
  type PaymentEnv,
  type PaymentOrderStoreAdapter,
} from './paymentOrders.js';

const MAX_NOTIFY_BODY_BYTES = 128 * 1024;

export type AlipayNotifyParams = Record<string, string>;

function decimalAmountToFen(value: string): number {
  const match = value.trim().match(/^(\d{1,9})(?:\.(\d{1,2}))?$/u);
  if (!match) throw new Error('invalid Alipay notification amount');
  const fen = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(fen) || fen <= 0) {
    throw new Error('invalid Alipay notification amount');
  }
  return fen;
}

export function parseAlipayNotificationBody(body: unknown): AlipayNotifyParams {
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_NOTIFY_BODY_BYTES) {
      throw new Error('Alipay notification body is too large');
    }
    const params: AlipayNotifyParams = {};
    for (const [key, value] of new URLSearchParams(body)) {
      if (Object.hasOwn(params, key)) {
        throw new Error('Alipay notification contains duplicate fields');
      }
      params[key] = value;
    }
    return params;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Alipay notification body is invalid');
  }

  const params: AlipayNotifyParams = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') {
      throw new Error('Alipay notification contains invalid fields');
    }
    params[key] = value;
  }
  return params;
}

function hasPaidTradeStatus(params: AlipayNotifyParams): boolean {
  return (
    (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED') &&
    !params.out_biz_no &&
    !params.gmt_refund &&
    !params.refund_fee
  );
}

function sellerMatches(
  params: AlipayNotifyParams,
  configuration: ReturnType<typeof loadAlipayConfiguration>,
): boolean {
  if (configuration.sellerId && params.seller_id === configuration.sellerId) return true;
  return Boolean(
    configuration.sellerEmail &&
      params.seller_email &&
      params.seller_email.toLowerCase() === configuration.sellerEmail.toLowerCase(),
  );
}

export async function handleAlipayNotification(
  params: AlipayNotifyParams,
  env: PaymentEnv & AlipayWebPayEnv = process.env,
  receivedAt = new Date(),
  store: PaymentOrderStoreAdapter = createPaymentOrderStore(env),
): Promise<void> {
  const configuration = loadAlipayConfiguration(env);
  if (!params.sign || params.sign_type !== 'RSA2') {
    throw new Error('Alipay notification signature is missing or unsupported');
  }
  if (params.app_id !== configuration.appId || !sellerMatches(params, configuration)) {
    throw new Error('Alipay notification merchant does not match local configuration');
  }

  const sdk = createAlipaySdk(configuration);
  if (!sdk.checkNotifySignV2(params)) {
    throw new Error('Alipay notification signature verification failed');
  }

  const orderId = params.out_trade_no?.trim() ?? '';
  const notifyId = params.notify_id?.trim() ?? '';
  const tradeNo = params.trade_no?.trim() ?? '';
  const notifyType = params.notify_type?.trim() ?? '';
  const tradeStatus = params.trade_status?.trim() ?? '';
  if (!orderId || !notifyId || !tradeNo || !notifyType || !tradeStatus) {
    throw new Error('Alipay notification is missing required business fields');
  }

  const amountFen = decimalAmountToFen(params.total_amount ?? '');
  const order = await store.get(orderId);
  if (!order || order.provider !== 'alipay_page') {
    throw new Error('Alipay payment order not found');
  }
  if (amountFen !== Math.round(order.amountCny * 100)) {
    throw new Error('Alipay notification amount does not match the order');
  }

  await store.recordAlipayNotification({
    orderId,
    amountFen,
    providerTransactionId: tradeNo,
    notifyId,
    notifyType,
    tradeStatus,
    paid: hasPaidTradeStatus(params),
    receivedAt,
  });
}

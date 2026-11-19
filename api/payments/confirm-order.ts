import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGenerationEntitlement } from '../../server/entitlements.js';
import { confirmPaymentOrder, isPaymentAdminAuthorized } from '../../server/paymentOrders.js';
import { applyCors, getJsonInput, handleOptions } from '../../server/vercelHandlerUtils.js';

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const configured = Boolean(process.env.ECHO_PAYMENT_ADMIN_KEY?.trim());
  if (!isPaymentAdminAuthorized(req.headers as Record<string, string | string[] | undefined>)) {
    sendJson(res, configured ? 401 : 503, {
      error: configured ? 'payment admin authorization required' : 'payment admin key is not configured',
      code: configured ? 'PAYMENT_ADMIN_UNAUTHORIZED' : 'PAYMENT_ADMIN_NOT_CONFIGURED',
    });
    return;
  }

  const input = getJsonInput(req);
  if (!input) {
    sendJson(res, 400, { error: 'expected JSON body' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : input;
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' });
    return;
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId) {
    sendJson(res, 400, { error: 'orderId is required' });
    return;
  }

  try {
    const order = await confirmPaymentOrder({
      orderId,
      amountFen: typeof body.amountFen === 'number' ? body.amountFen : undefined,
      providerTransactionId:
        typeof body.providerTransactionId === 'string' ? body.providerTransactionId.trim() : null,
    });
    const entitlement = await getGenerationEntitlement(order.userId);
    sendJson(res, 200, { order, entitlement });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'unable to confirm payment order' });
  }
}

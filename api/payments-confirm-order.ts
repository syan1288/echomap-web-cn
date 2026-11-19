import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGenerationEntitlement } from '../server/entitlements.js';
import {
  confirmPaymentOrder,
  isPaymentAdminAuthorized,
} from '../server/paymentOrders.js';
import { applyCors, getJsonInput, handleOptions } from '../server/vercelHandlerUtils.js';

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

  if (!isPaymentAdminAuthorized(req.headers as Record<string, string | string[] | undefined>)) {
    sendJson(res, process.env.ECHO_PAYMENT_ADMIN_KEY?.trim() ? 401 : 503, {
      error: process.env.ECHO_PAYMENT_ADMIN_KEY?.trim()
        ? 'payment admin authorization required'
        : 'payment admin key is not configured',
      code: process.env.ECHO_PAYMENT_ADMIN_KEY?.trim() ? 'PAYMENT_ADMIN_UNAUTHORIZED' : 'PAYMENT_ADMIN_NOT_CONFIGURED',
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
  const amountFen = typeof body.amountFen === 'number' ? body.amountFen : undefined;
  const providerTransactionId =
    typeof body.providerTransactionId === 'string' ? body.providerTransactionId.trim() : null;

  if (!orderId) {
    sendJson(res, 400, { error: 'orderId is required' });
    return;
  }

  try {
    const order = await confirmPaymentOrder({ orderId, amountFen, providerTransactionId });
    const entitlement = await getGenerationEntitlement(order.userId);
    sendJson(res, 200, { order, entitlement });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'unable to confirm payment order' });
  }
}

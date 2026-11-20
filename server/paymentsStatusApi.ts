import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthenticatedUser, type HeaderLike } from './authUser.js';
import { getGenerationEntitlement } from './entitlements.js';
import { getAlipayPaymentStatus } from './paymentOrders.js';
import { applyCors, getJsonInput, handleOptions } from './vercelHandlerUtils.js';

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

  const auth = await getAuthenticatedUser(req.headers as HeaderLike);
  if (auth.ok === false) {
    sendJson(res, auth.status, {
      error: auth.status === 401 ? 'Login required to check payment status.' : auth.error,
      code: auth.status === 401 ? 'AUTH_REQUIRED' : 'AUTH_CONFIG_MISSING',
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
    const result = await getAlipayPaymentStatus({ userId: auth.userId, orderId });
    const entitlement = await getGenerationEntitlement(auth.userId);
    sendJson(res, 200, { ...result, entitlement });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unable to check payment status';
    const status = message === 'payment order not found' ? 404 : 400;
    sendJson(res, status, { error: message });
  }
}

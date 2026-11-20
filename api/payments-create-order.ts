import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthenticatedUser, type HeaderLike } from '../server/authUser.js';
import { createPaymentCheckout, listPaymentPlans } from '../server/paymentOrders.js';
import { applyCors, getJsonInput, handleOptions } from '../server/vercelHandlerUtils.js';

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method === 'GET') {
    sendJson(res, 200, { plans: listPaymentPlans().filter((plan) => plan.enabled) });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const auth = await getAuthenticatedUser(req.headers as HeaderLike);
  if (auth.ok === false) {
    sendJson(res, auth.status, {
      error: auth.status === 401 ? 'Login required before creating payment order.' : auth.error,
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

  const planId = typeof body.planId === 'string' ? body.planId : '';
  const contact = typeof body.contact === 'string' ? body.contact : null;

  try {
    const checkout = await createPaymentCheckout({ userId: auth.userId, planId, contact });
    sendJson(res, 200, checkout);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'unable to create order' });
  }
}

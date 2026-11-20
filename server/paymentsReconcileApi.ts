import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isPaymentReconcileAuthorized,
  reconcilePendingAlipayPayments,
} from './paymentOrders.js';
import type { HeaderLike } from './authUser.js';

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  if (!isPaymentReconcileAuthorized(req.headers as HeaderLike)) {
    const configured = Boolean(
      process.env.ECHO_PAYMENT_ADMIN_KEY?.trim() || process.env.CRON_SECRET?.trim(),
    );
    sendJson(res, configured ? 401 : 503, {
      error: configured
        ? 'payment reconciliation authorization required'
        : 'payment reconciliation key is not configured',
      code: configured
        ? 'PAYMENT_RECONCILE_UNAUTHORIZED'
        : 'PAYMENT_RECONCILE_NOT_CONFIGURED',
    });
    return;
  }

  try {
    const result = await reconcilePendingAlipayPayments();
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'unable to reconcile Alipay payments',
    });
  }
}

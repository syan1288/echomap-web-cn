import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAlipayNotification, parseAlipayNotificationBody } from './alipayNotify.js';

type RawBodyRequest = VercelRequest & { rawBody?: string };

function rawBodyFromRequest(req: RawBodyRequest): unknown {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  return req.body;
}

export default async function handler(req: RawBodyRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('failure');
    return;
  }

  try {
    const params = parseAlipayNotificationBody(rawBodyFromRequest(req));
    await handleAlipayNotification(params);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('success');
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(400).send('failure');
  }
}

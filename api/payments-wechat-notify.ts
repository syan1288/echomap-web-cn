import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWechatPayNotify } from '../server/wechatPayNotify.js';

type RawBodyRequest = VercelRequest & { rawBody?: string };

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.status(status).json(body);
}

function rawBodyFromRequest(req: RawBodyRequest): string {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

export default async function handler(req: RawBodyRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  try {
    const result = await handleWechatPayNotify({
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody: rawBodyFromRequest(req),
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, {
      code: 'FAIL',
      message: error instanceof Error ? error.message : 'unable to handle WeChat Pay notification',
    });
  }
}

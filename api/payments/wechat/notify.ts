import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleWechatPayNotify } from '../../../server/wechatPayNotify.js';

type RawBodyRequest = VercelRequest & { rawBody?: string };

function rawBodyFromRequest(req: RawBodyRequest): string {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

export default async function handler(req: RawBodyRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  try {
    const result = await handleWechatPayNotify({
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody: rawBodyFromRequest(req),
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      code: 'FAIL',
      message: error instanceof Error ? error.message : 'unable to handle WeChat Pay notification',
    });
  }
}

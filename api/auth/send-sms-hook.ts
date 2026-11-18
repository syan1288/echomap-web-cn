import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJsonInput } from '../../server/vercelHandlerUtils.js';
import { handleSupabaseSendSmsHook } from '../../server/supabaseSmsHook.js';

function rawBodyFromRequest(req: VercelRequest): string {
  const rawBody = (req as VercelRequest & { rawBody?: unknown }).rawBody;
  if (typeof rawBody === 'string') return rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');

  const input = getJsonInput(req);
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') return JSON.stringify(input);
  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({
      error: {
        http_code: 405,
        message: 'method not allowed',
      },
    });
    return;
  }

  const result = await handleSupabaseSendSmsHook(rawBodyFromRequest(req), req.headers, process.env);
  res.status(result.status).json(result.body);
}

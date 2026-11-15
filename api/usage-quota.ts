import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUsageQuotaRequest } from '../server/usageQuotaApiCore.js';

function applyCors(res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const result = await handleUsageQuotaRequest(req.headers, body, process.env);
  res.status(result.status).json(result.body);
}

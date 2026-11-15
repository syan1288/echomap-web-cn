import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerationQuotaRequest } from '../server/generationQuotaApiCore.js';

function applyCors(res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const result = await handleGenerationQuotaRequest(req.headers, process.env);
  res.status(result.status).json(result.body);
}

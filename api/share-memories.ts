import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildMemorySharePayload } from '../shared/domain/share/memorySharePayload.js';

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.status(204).end();
  return true;
}

function getJsonBody(req: VercelRequest): Record<string, unknown> | null {
  const body = req.body;
  if (!body) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const body = getJsonBody(req);
  if (!body) {
    res.status(400).json({ error: 'invalid json body' });
    return;
  }

  const result = buildMemorySharePayload(body);
  if (result.ok === false) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json(result.payload);
}

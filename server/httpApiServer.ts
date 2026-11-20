import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import generateHandler from '../api/generate.js';
import geocodeHandler from '../api/geocode.js';
import generationQuotaHandler from '../api/generation-quota.js';
import healthHandler from './echoHealth.js';
import paymentsCreateOrderHandler from '../api/payments-create-order.js';
import paymentsConfirmOrderHandler from '../api/payments-confirm-order.js';
import paymentsStatusHandler from './paymentsStatusApi.js';
import paymentsAlipayNotifyHandler from './paymentsAlipayNotifyApi.js';
import paymentsReconcileHandler from './paymentsReconcileApi.js';
import paymentsWechatNotifyHandler from '../api/payments-wechat-notify.js';
import shareMemoriesHandler from '../api/share-memories.js';
import usageQuotaHandler from '../api/usage-quota.js';
import { handleSupabaseSendSmsHook } from './supabaseSmsHook.js';

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = line.slice(0, equalIndex).trim();
    if (!key || process.env[key] != null) continue;

    const rawValue = line.slice(equalIndex + 1).trim();
    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

function loadLocalEnv(): void {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, '.env'));
  loadEnvFile(path.join(cwd, '.env.local'));
}

loadLocalEnv();

const HOST = process.env.HOST?.trim() || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const MAX_BODY_BYTES = 24 * 1024 * 1024;

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

async function authSendSmsHookHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const rawBody =
    typeof req.body === 'string'
      ? req.body
      : req.body && typeof req.body === 'object'
        ? JSON.stringify(req.body)
        : '';
  const result = await handleSupabaseSendSmsHook(
    rawBody,
    req.headers as Record<string, string | string[] | undefined>,
    process.env,
  );
  res.status(result.status).json(result.body);
}

const routes = new Map<string, Handler>([
  ['/api/auth/send-sms-hook', authSendSmsHookHandler],
  ['/api/generate', generateHandler],
  ['/api/generation-quota', generationQuotaHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/echo-health', healthHandler],
  ['/api/payments/create-order', paymentsCreateOrderHandler],
  ['/api/payments/confirm-order', paymentsConfirmOrderHandler],
  ['/api/payments/status', paymentsStatusHandler],
  ['/api/payments/alipay/notify', paymentsAlipayNotifyHandler],
  ['/api/payments/reconcile', paymentsReconcileHandler],
  ['/api/payments/wechat/notify', paymentsWechatNotifyHandler],
  ['/api/share-memories', shareMemoriesHandler],
  ['/api/usage-quota', usageQuotaHandler],
]);

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function buildRequest(req: IncomingMessage, rawBody: string): VercelRequest {
  const contentType = req.headers['content-type'] || '';
  let body: string | Record<string, unknown> | undefined = rawBody;

  if (rawBody && contentType.includes('application/json')) {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      body = rawBody;
    }
  }

  const request = req as VercelRequest;
  request.body = body;
  (request as VercelRequest & { rawBody?: string }).rawBody = rawBody;
  request.query = {};
  request.cookies = {};
  return request;
}

function buildResponse(res: ServerResponse): VercelResponse {
  const vRes = res as VercelResponse;

  vRes.status = ((code: number) => {
    res.statusCode = code;
    return vRes;
  }) as VercelResponse['status'];

  vRes.json = ((body: unknown) => {
    if (!res.headersSent && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(body));
    return vRes;
  }) as VercelResponse['json'];

  vRes.send = ((body: unknown) => {
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      if (!res.headersSent && !res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(body));
      return vRes;
    }
    res.end(body as string | Uint8Array);
    return vRes;
  }) as VercelResponse['send'];

  return vRes;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const handler = routes.get(url.pathname);

  if (!handler) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  try {
    const rawBody = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
    const vReq = buildRequest(req, rawBody);
    const vRes = buildResponse(res);
    await handler(vReq, vRes);
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
      sendJson(res, 413, { error: 'payload too large' });
      return;
    }
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'internal server error',
    });
  }
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.info(`[echo-api-server] listening on http://${HOST}:${PORT}`);
});

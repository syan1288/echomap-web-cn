import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import generateHandler from '../api/generate.js';
import geocodeHandler from '../api/geocode.js';
import healthHandler from '../api/echo-health.js';

const HOST = process.env.HOST?.trim() || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const MAX_BODY_BYTES = 24 * 1024 * 1024;

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

const routes = new Map<string, Handler>([
  ['/api/generate', generateHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/echo-health', healthHandler],
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
  request.query = {};
  request.cookies = {};
  return request;
}

function buildResponse(res: ServerResponse): VercelResponse {
  return res as VercelResponse;
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

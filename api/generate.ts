import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash, createHmac } from 'node:crypto';

type EchoApiEnv = {
  API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_MODEL?: string;
  JIMENG_ACCESS_KEY_ID?: string;
  JIMENG_SECRET_ACCESS_KEY?: string;
  JIMENG_BASE_URL?: string;
  JIMENG_REQ_KEY?: string;
  JIMENG_REGION?: string;
  JIMENG_SERVICE?: string;
  ARK_API_KEY?: string;
  ARK_BASE_URL?: string;
  JIMENG_API_KEY?: string;
  JIMENG_API_BASE_URL?: string;
  JIMENG_IMAGE_MODEL?: string;
  JIMENG_SIZE?: string;
  JIMENG_SCALE?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
  ECHO_PREFER_API_KEY?: string;
};

const MAX_JSON_BODY_CHARS = 22 * 1024 * 1024;
const BUILDING_STYLE_IDS = ['flat', 'pixel', 'ink', 'healing'] as const;
type BuildingStyleId = (typeof BUILDING_STYLE_IDS)[number];
const DEFAULT_BUILDING_STYLE: BuildingStyleId = 'flat';

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = process.env.ALLOW_ORIGIN?.trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allow);
  if (allow !== '*') res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(req, res);
  res.statusCode = 204;
  res.end();
  return true;
}

function getJsonInput(req: VercelRequest): string | Record<string, unknown> | null {
  const b = req.body;
  if (b == null) return null;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  if (typeof b === 'object') return b as Record<string, unknown>;
  return null;
}

function envFromProcess(): EchoApiEnv {
  return {
    API_KEY: process.env.API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    JIMENG_ACCESS_KEY_ID: process.env.JIMENG_ACCESS_KEY_ID,
    JIMENG_SECRET_ACCESS_KEY: process.env.JIMENG_SECRET_ACCESS_KEY,
    JIMENG_BASE_URL: process.env.JIMENG_BASE_URL,
    JIMENG_REQ_KEY: process.env.JIMENG_REQ_KEY,
    JIMENG_REGION: process.env.JIMENG_REGION,
    JIMENG_SERVICE: process.env.JIMENG_SERVICE,
    ARK_API_KEY: process.env.ARK_API_KEY,
    ARK_BASE_URL: process.env.ARK_BASE_URL,
    JIMENG_API_KEY: process.env.JIMENG_API_KEY,
    JIMENG_API_BASE_URL: process.env.JIMENG_API_BASE_URL,
    JIMENG_IMAGE_MODEL: process.env.JIMENG_IMAGE_MODEL,
    JIMENG_SIZE: process.env.JIMENG_SIZE,
    JIMENG_SCALE: process.env.JIMENG_SCALE,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    ECHO_IMAGE_MODEL: process.env.ECHO_IMAGE_MODEL,
    ECHO_PREFER_API_KEY: process.env.ECHO_PREFER_API_KEY,
  };
}

function resolveOpenAIImageModel(env: EchoApiEnv): string {
  const explicit = env.OPENAI_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  // UI label remains "gpt-image-2"; backend defaults to current Images API GPT model.
  return 'gpt-image-1.5';
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacHex(key: Buffer | string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

function hmacBuffer(key: Buffer | string, message: string): Buffer {
  return createHmac('sha256', key).update(message, 'utf8').digest();
}

function toUtcXDate(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function buildVolcAuthorization(args: {
  method: 'POST';
  canonicalUri: string;
  canonicalQuery: string;
  host: string;
  contentSha256: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  xDate: string;
}): string {
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalHeaders = [
    'content-type:application/json',
    `host:${args.host}`,
    `x-content-sha256:${args.contentSha256}`,
    `x-date:${args.xDate}`,
    '',
  ].join('\n');
  const canonicalRequest = [
    args.method,
    args.canonicalUri,
    args.canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    args.contentSha256,
  ].join('\n');
  const shortDate = args.xDate.slice(0, 8);
  const credentialScope = `${shortDate}/${args.region}/${args.service}/request`;
  const stringToSign = ['HMAC-SHA256', args.xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmacBuffer(args.secretAccessKey, shortDate);
  const kRegion = hmacBuffer(kDate, args.region);
  const kService = hmacBuffer(kRegion, args.service);
  const kSigning = hmacBuffer(kService, 'request');
  const signature = hmacHex(kSigning, stringToSign);
  return `HMAC-SHA256 Credential=${args.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function buildVolcCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

function buildVolcRequestUrl(baseUrl: string, canonicalQuery: string): { url: string; host: string } {
  const trimmed = baseUrl.replace(/[/?#]+$/, '');
  const host = new URL(trimmed).host;
  return {
    url: canonicalQuery ? `${trimmed}?${canonicalQuery}` : trimmed,
    host,
  };
}

function resolveJimengConfig(env: EchoApiEnv) {
  const accessKeyId = env.JIMENG_ACCESS_KEY_ID?.trim() || '';
  const secretAccessKey = env.JIMENG_SECRET_ACCESS_KEY?.trim() || '';
  const baseUrl = (env.JIMENG_BASE_URL?.trim() || 'https://visual.volcengineapi.com').replace(/\/+$/, '');
  const reqKey = env.JIMENG_REQ_KEY?.trim() || 'jimeng_seedream46_cvtob';
  const region = env.JIMENG_REGION?.trim() || 'cn-north-1';
  const service = env.JIMENG_SERVICE?.trim() || 'cv';
  const parsedSize = Number(env.JIMENG_SIZE);
  const size = Number.isFinite(parsedSize) && parsedSize >= 1024 * 1024 && parsedSize <= 4096 * 4096
    ? Math.round(parsedSize)
    : 2048 * 2048;
  const parsedScale = Number(env.JIMENG_SCALE);
  const scale = Number.isFinite(parsedScale) && parsedScale >= 1 && parsedScale <= 100 ? Math.round(parsedScale) : 50;
  return { accessKeyId, secretAccessKey, baseUrl, reqKey, region, service, size, scale };
}

async function requestJimengImageEdit(args: {
  env: EchoApiEnv;
  imageUrls: string[];
  prompt: string;
}): Promise<{ imageUrl: string; model: string; backend: 'jimeng' }> {
  const conf = resolveJimengConfig(args.env);
  if (!conf.accessKeyId || !conf.secretAccessKey) {
    throw new Error('JIMENG_ACCESS_KEY_ID or JIMENG_SECRET_ACCESS_KEY is missing');
  }
  if (!args.imageUrls.length) {
    throw new Error('即梦 4.6 需要至少一张可访问的图片 URL。');
  }

  const submitQuery = buildVolcCanonicalQuery({
    Action: 'CVSync2AsyncSubmitTask',
    Version: '2022-08-31',
  });
  const submitRequest = buildVolcRequestUrl(conf.baseUrl, submitQuery);
  const submitBody = {
    req_key: conf.reqKey,
    image_urls: args.imageUrls.slice(0, 14),
    prompt: args.prompt,
  };
  const submitText = JSON.stringify(submitBody);
  const submitSha = sha256Hex(submitText);
  const submitXDate = toUtcXDate();
  const submitAuthorization = buildVolcAuthorization({
    method: 'POST',
    canonicalUri: '/',
    canonicalQuery: submitQuery,
    host: submitRequest.host,
    contentSha256: submitSha,
    accessKeyId: conf.accessKeyId,
    secretAccessKey: conf.secretAccessKey,
    region: conf.region,
    service: conf.service,
    xDate: submitXDate,
  });
  const submitResponse = await fetch(submitRequest.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Sha256': submitSha,
      'X-Date': submitXDate,
      Authorization: submitAuthorization,
    },
    body: submitText,
  });
  const submitRaw = await submitResponse.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitRaw ? JSON.parse(submitRaw) : null;
  } catch {
    submitJson = null;
  }
  const submitOut = submitJson as { code?: number; data?: { task_id?: string }; message?: string } | null;
  if (!submitResponse.ok || submitOut?.code !== 10000 || !submitOut?.data?.task_id) {
    const apiMsg = typeof submitOut?.message === 'string' ? submitOut.message : '';
    const raw = submitRaw ? submitRaw.slice(0, 220) : '';
    const msg = [apiMsg, raw ? `raw=${raw}` : null]
      .filter(Boolean)
      .join(' | ');
    throw new Error(msg || `Jimeng submit failed (${submitResponse.status})`);
  }

  const taskId = submitOut.data.task_id;
  const resultQuery = buildVolcCanonicalQuery({
    Action: 'CVSync2AsyncGetResult',
    Version: '2022-08-31',
  });
  const resultRequest = buildVolcRequestUrl(conf.baseUrl, resultQuery);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const resultBody = {
      req_key: conf.reqKey,
      task_id: taskId,
    };
    const resultText = JSON.stringify(resultBody);
    const resultSha = sha256Hex(resultText);
    const resultXDate = toUtcXDate();
    const resultAuthorization = buildVolcAuthorization({
      method: 'POST',
      canonicalUri: '/',
      canonicalQuery: resultQuery,
      host: resultRequest.host,
      contentSha256: resultSha,
      accessKeyId: conf.accessKeyId,
      secretAccessKey: conf.secretAccessKey,
      region: conf.region,
      service: conf.service,
      xDate: resultXDate,
    });
    const resultResponse = await fetch(resultRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Sha256': resultSha,
        'X-Date': resultXDate,
        Authorization: resultAuthorization,
      },
      body: resultText,
    });
    const resultRaw = await resultResponse.text();
    let resultJson: unknown = null;
    try {
      resultJson = resultRaw ? JSON.parse(resultRaw) : null;
    } catch {
      resultJson = null;
    }
    const resultOut = resultJson as {
      code?: number;
      data?: { status?: string; binary_data_base64?: string[] | null; image_urls?: string[] | null };
      message?: string;
    } | null;
    if (!resultResponse.ok || resultOut?.code !== 10000) {
      const apiMsg = typeof resultOut?.message === 'string' ? resultOut.message : '';
      const raw = resultRaw ? resultRaw.slice(0, 220) : '';
      const msg = [apiMsg, raw ? `raw=${raw}` : null]
        .filter(Boolean)
        .join(' | ');
      throw new Error(msg || `Jimeng result failed (${resultResponse.status})`);
    }
    const status = resultOut.data?.status;
    if (status === 'in_queue' || status === 'generating') continue;
    if (status !== 'done') throw new Error(`Jimeng task status: ${status || 'unknown'}`);
    const b64 = resultOut.data?.binary_data_base64?.[0];
    if (b64 && typeof b64 === 'string') {
      return { imageUrl: `data:image/png;base64,${b64}`, model: conf.reqKey, backend: 'jimeng' };
    }
    const urlOut = resultOut.data?.image_urls?.[0];
    if (urlOut && typeof urlOut === 'string') {
      return { imageUrl: urlOut, model: conf.reqKey, backend: 'jimeng' };
    }
    throw new Error('Jimeng returned no image data');
  }
  throw new Error('Jimeng task timed out');
}

async function requestOpenAIImageEdit(args: {
  env: EchoApiEnv;
  imageBase64: string;
  mimeType: string;
  prompt: string;
}): Promise<{ imageUrl: string; model: string; backend: 'openai' }> {
  const apiKey = args.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }
  const model = resolveOpenAIImageModel(args.env);
  const imageBytes = Buffer.from(args.imageBase64, 'base64');
  const form = new FormData();
  form.append('model', model);
  form.append(
    'image[]',
    new Blob([imageBytes], { type: args.mimeType || 'image/jpeg' }),
    `upload.${(args.mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`
  );
  form.append('prompt', args.prompt);
  form.append('size', 'auto');
  form.append('quality', 'auto');
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');
  form.append('input_fidelity', 'high');

  const call = async (withoutInputFidelity = false) => {
    if (withoutInputFidelity) form.delete('input_fidelity');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    const text = await r.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { r, text, json };
  };

  let out = await call(false);
  if (!out.r.ok && out.r.status === 400 && out.text.includes('input_fidelity')) {
    out = await call(true);
  }
  if (!out.r.ok) {
    throw new Error(
      typeof (out.json as { error?: { message?: string } } | null)?.error?.message === 'string'
        ? (out.json as { error: { message: string } }).error.message
        : `OpenAI image edit failed (${out.r.status})`
    );
  }
  const data = (out.json as { data?: Array<{ b64_json?: string; url?: string }> } | null)?.data;
  const first = data?.[0];
  if (first?.b64_json) {
    return { imageUrl: `data:image/png;base64,${first.b64_json}`, model, backend: 'openai' };
  }
  if (first?.url) {
    return { imageUrl: first.url, model, backend: 'openai' };
  }
  throw new Error('OpenAI returned no image data');
}

function applyCredentialsEnv(env: EchoApiEnv) {
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json && !env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    const dir = mkdtempSync(path.join(tmpdir(), 'echo-gcp-'));
    const p = path.join(dir, 'sa.json');
    writeFileSync(p, json, 'utf8');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = p;
  }
  const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (cred && !cred.startsWith('{')) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.isAbsolute(cred) ? cred : path.resolve(process.cwd(), cred);
  }
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
  if (project) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_CLOUD_PROJECT = project;
    process.env.GOOGLE_CLOUD_LOCATION = location;
  }
}

function createGenAI(env: EchoApiEnv): GoogleGenAI | null {
  applyCredentialsEnv(env);
  const key = env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim();
  const preferApiKey = (env.ECHO_PREFER_API_KEY || '').trim().toLowerCase() === 'true';
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
  if (preferApiKey && key) {
    return new GoogleGenAI({ apiKey: key });
  }
  if (project) {
    return new GoogleGenAI({ vertexai: true, project, location, apiVersion: 'v1' });
  }
  if (key) return new GoogleGenAI({ apiKey: key });
  return null;
}

function resolveImageModel(env: EchoApiEnv): string {
  const explicit = env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  if (env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim()) {
    // Reference implementation default
    return 'gemini-2.5-flash-image-preview';
  }
  return 'gemini-2.5-flash-image';
}

function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

function buildEchoImageSystemInstruction(style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  void style;
  return '仅针对图中主体建筑，创建一个3D 等距视角建筑。建筑应被单独分离，无任何背景，无阴影，png。';
}

function buildInitialUserPrompt(buildingName?: string): string {
  return buildInitialUserPromptWithStyle(buildingName, DEFAULT_BUILDING_STYLE);
}

function buildUserStyleReminder(style: BuildingStyleId): string {
  switch (style) {
    case 'pixel':
      return '32-bit pixel art, featuring chunky square pixels with clear edges. Use clearly visible chunky 32 px blocks. Strictly flat color blocks: no blur, no outlines, no gradients on pixel objects.';
    case 'ink':
      return 'ink wash，baimiao, highly detailed，vibrant but elegant colors';
    case 'healing':
      return '治愈绘本插画风，线条随性松散，marker sketch+ charcoal 质感';
    case 'flat':
    default:
      return '扁平插画风，svg（300dpi），细节清晰';
  }
}

function buildInitialUserPromptWithStyle(buildingName: string | undefined, style: BuildingStyleId): string {
  const trimmed = buildingName?.trim();
  return trimmed
    ? `建筑名称参考：${trimmed}。风格要求：${buildUserStyleReminder(style)}`
    : `风格要求：${buildUserStyleReminder(style)}`;
}

function buildEditUserPrompt(editInstruction: string, buildingName?: string, style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const extra = buildingName?.trim() ? ` 建筑名称参考：${buildingName.trim()}。` : '';
  return `${editInstruction.trim()}${extra} 风格要求：${buildUserStyleReminder(style)}`.trim();
}

function extractInlineImageFromResponse(response: {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    content?: { parts?: Array<Record<string, unknown>> };
  }>;
  data?: string;
  text?: string;
}): { imageUrl: string } | { error: string } {
  const pf = response.promptFeedback;
  if (pf?.blockReason) {
    return { error: `Prompt blocked (${pf.blockReason}) ${pf.blockReasonMessage || ''}`.trim() };
  }
  const candidates = response.candidates;
  if (!candidates?.length) return { error: 'No candidates returned (empty or filtered).' };
  for (const cand of candidates) {
    for (const part of cand.content?.parts || []) {
      const inline = part.inlineData as { data?: string; mimeType?: string } | undefined;
      if (inline?.data) return { imageUrl: `data:${inline.mimeType || 'image/png'};base64,${inline.data}` };
    }
  }
  if (typeof response.data === 'string' && response.data.length > 0) {
    return { imageUrl: `data:image/png;base64,${response.data}` };
  }
  const c0 = candidates[0];
  const textPart = c0?.content?.parts?.find((p) => typeof p.text === 'string')?.text as string | undefined;
  return { error: response.text || textPart || c0?.finishMessage || c0?.finishReason || 'No image in API response.' };
}

export const config = { maxDuration: 120 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const input = getJsonInput(req);
  if (input === null) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'expected JSON body' }));
    return;
  }

  const rawBody = typeof input === 'string' ? input : JSON.stringify(input);
  if (rawBody.length > MAX_JSON_BODY_CHARS) {
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'payload too large' }));
    return;
  }

  let body: {
    imageBase64?: string;
    imageUrls?: string[];
    mimeType?: string;
    prompt?: string;
    buildingName?: string;
    userPrompt?: string;
    buildingStyle?: string;
    preferredModel?: 'gemini' | 'jimeng' | 'gpt-image-2';
  };
  try {
    body = (typeof input === 'object' ? input : JSON.parse(rawBody)) as typeof body;
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid JSON' }));
    return;
  }

  if (!body.imageBase64) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'imageBase64 required' }));
    return;
  }

  try {
    const env = envFromProcess();
    const wantsJimeng = body.preferredModel === 'jimeng';
    const wantsOpenAI = body.preferredModel === 'gpt-image-2';
    const ai = wantsOpenAI || wantsJimeng ? null : createGenAI(env);
    if (!wantsOpenAI && !wantsJimeng && !ai) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            'No AI client: set GEMINI_API_KEY, OPENAI_API_KEY, JIMENG_ACCESS_KEY_ID + JIMENG_SECRET_ACCESS_KEY, or GOOGLE_CLOUD_PROJECT + GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS',
        })
      );
      return;
    }

    const imageModel = resolveImageModel(env);
    const buildingStyle = isBuildingStyleId(body.buildingStyle) ? body.buildingStyle : DEFAULT_BUILDING_STYLE;
    const directPrompt = body.prompt?.trim();
    const baseUserText = directPrompt
      ? directPrompt
      : body.userPrompt?.trim()
        ? buildEditUserPrompt(body.userPrompt, body.buildingName, buildingStyle)
        : buildInitialUserPromptWithStyle(body.buildingName, buildingStyle);
    const userText = baseUserText;
    const stitchedPrompt = [
      'System constraints:',
      buildEchoImageSystemInstruction(buildingStyle),
      '',
      'User request:',
      userText,
    ].join('\n');

    if (wantsOpenAI) {
      const openai = await requestOpenAIImageEdit({
        env,
        imageBase64: body.imageBase64,
        mimeType: body.mimeType || 'image/jpeg',
        prompt: stitchedPrompt,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          imageUrl: openai.imageUrl,
          model: openai.model,
          requestedModel: body.preferredModel || 'gemini',
          backend: openai.backend,
        })
      );
      return;
    }
    if (wantsJimeng) {
      const jimeng = await requestJimengImageEdit({
        env,
        imageUrls: body.imageUrls ?? [],
        prompt: stitchedPrompt,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          imageUrl: jimeng.imageUrl,
          model: jimeng.model,
          requestedModel: body.preferredModel || 'gemini',
          backend: jimeng.backend,
        })
      );
      return;
    }

    const requestImage = async (promptText: string) =>
      ai.models.generateContent({
        model: imageModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: body.imageBase64!,
                  mimeType: body.mimeType || 'image/jpeg',
                },
              },
              { text: promptText },
            ],
          },
        ],
        config: {
          systemInstruction: buildEchoImageSystemInstruction(buildingStyle),
          // Prefer image-only output to avoid text-only STOP responses.
          responseModalities: [Modality.IMAGE],
        },
      });

    const toExtractInput = (response: unknown) =>
      response as {
        promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
        candidates?: Array<{
          finishReason?: string;
          finishMessage?: string;
          content?: { parts?: Array<Record<string, unknown>> };
        }>;
        data?: string;
        text?: string;
      };

    let response = await requestImage(stitchedPrompt);
    let extracted = extractInlineImageFromResponse(toExtractInput(response));
    if ('error' in extracted) {
      const retryPrompt =
        `${stitchedPrompt}\n\n` +
        'Output requirement: return only one generated image. Do not return explanation text. ' +
        'If you cannot comply, still return an image attempt instead of text.';
      response = await requestImage(retryPrompt);
      extracted = extractInlineImageFromResponse(toExtractInput(response));
    }

    res.statusCode = 'error' in extracted ? 500 : 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify(
        'error' in extracted
          ? { error: extracted.error }
          : {
              imageUrl: extracted.imageUrl,
              model: imageModel,
              requestedModel: body.preferredModel || 'gemini',
              backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai',
            }
      )
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: msg }));
  }
}

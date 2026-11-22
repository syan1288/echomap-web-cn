import type { VercelRequest, VercelResponse } from '@vercel/node';
import echoHealthHandler from '../server/echoHealth.js';
import { GoogleGenAI, Modality } from '@google/genai';
import path from 'node:path';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getAuthenticatedUser, type HeaderLike } from '../server/authUser.js';
import {
  consumeGenerationEntitlement,
  getGenerationEntitlement,
  type GenerationEntitlement,
} from '../server/entitlements.js';
import {
  describeProviderError,
  getProviderErrorRuntimeInfo,
} from '../shared/domain/image/providerError.js';
import { parseGoogleServiceAccountJson } from '../shared/domain/googleServiceAccount.js';
import {
  DEFAULT_BUILDING_STYLE_PROMPTS,
  MAX_STYLE_PROMPT_LENGTH,
} from '../shared/domain/building-style/buildingStyle.js';
import { buildJimengPrompt } from '../shared/domain/image/jimengPrompt.js';
import { uploadJimengInputFromBase64 } from '../server/jimengImageInput.js';

type EchoApiEnv = {
  API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_IMAGE_SIZE?: string;
  OPENAI_IMAGE_QUALITY?: string;
  OPENAI_IMAGE_RESOLUTION?: string;
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
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

// Keep direct callers aligned with Vercel's smaller serverless request-body
// limit. The web client compresses images to leave room for JSON/Base64.
const MAX_JSON_BODY_CHARS = 4 * 1024 * 1024;
const BUILDING_STYLE_IDS = ['flat', 'pixel', 'ink', 'healing'] as const;
type BuildingStyleId = (typeof BUILDING_STYLE_IDS)[number];
const DEFAULT_BUILDING_STYLE: BuildingStyleId = 'flat';

function isQuotaEnabled(): boolean {
  const raw = process.env.ECHO_GENERATION_QUOTA_ENABLED?.trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function authorizeGeneration(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  if (!isQuotaEnabled()) return null;

  const auth = await getAuthenticatedUser(req.headers as HeaderLike, process.env);
  if (auth.ok === false) {
    sendJson(res, auth.status, {
      error:
        auth.status === 401
          ? 'Login required before generating images.'
          : auth.error,
      code: auth.status === 401 ? 'AUTH_REQUIRED' : 'AUTH_CONFIG_MISSING',
    });
    return null;
  }

  const entitlement = await getGenerationEntitlement(auth.userId, process.env);
  if (!entitlement.allowed) {
    sendJson(res, 402, {
      error: 'Free generation quota used up. Upgrade or wait until next month.',
      code: 'GENERATION_QUOTA_EXHAUSTED',
      entitlement,
    });
    return null;
  }

  return auth.userId;
}

async function consumeQuotaForSuccess(
  userId: string | null
): Promise<GenerationEntitlement | null> {
  return userId ? consumeGenerationEntitlement(userId, process.env) : null;
}

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
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE,
    OPENAI_IMAGE_QUALITY: process.env.OPENAI_IMAGE_QUALITY,
    OPENAI_IMAGE_RESOLUTION: process.env.OPENAI_IMAGE_RESOLUTION,
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
  if (isApimartOpenAIGateway(resolveOpenAIBaseUrl(env))) {
    return 'gpt-image-2';
  }
  // ChatGPT 图像 2.0 在 API 里对应当前 ChatGPT 图像别名。
  return 'chatgpt-image-latest';
}

function resolveOpenAIBaseUrl(env: EchoApiEnv): string {
  const explicit = env.OPENAI_BASE_URL?.trim();
  if (!explicit) return 'https://api.openai.com/v1';
  return explicit.replace(/\/+$/, '');
}

function isApimartOpenAIGateway(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).host === 'api.apimart.ai';
  } catch {
    return false;
  }
}

function resolveOpenAIImageSize(env: EchoApiEnv): '1024x1024' | '1024x1536' | '1536x1024' {
  const explicit = env.OPENAI_IMAGE_SIZE?.trim();
  if (explicit === '1024x1536' || explicit === '1536x1024' || explicit === '1024x1024') {
    return explicit;
  }
  return '1024x1024';
}

function resolveOpenAIImageQuality(env: EchoApiEnv): 'low' | 'medium' | 'high' {
  const explicit = env.OPENAI_IMAGE_QUALITY?.trim();
  if (explicit === 'low' || explicit === 'medium' || explicit === 'high') {
    return explicit;
  }
  return 'medium';
}

function resolveOpenAIImageResolution(env: EchoApiEnv): '1k' | '2k' | '4k' {
  const explicit = env.OPENAI_IMAGE_RESOLUTION?.trim();
  if (explicit === '1k' || explicit === '2k' || explicit === '4k') {
    return explicit;
  }
  return '1k';
}

function buildImageDataUri(imageBase64: string, mimeType: string): string {
  return `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
}

async function requestApimartGptImage2(args: {
  env: EchoApiEnv;
  imageBase64: string;
  imageUrls?: string[];
  mimeType: string;
  prompt: string;
}): Promise<{ imageUrl: string; model: string; backend: 'openai' }> {
  const apiKey = args.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const baseUrl = resolveOpenAIBaseUrl(args.env);
  const model = resolveOpenAIImageModel(args.env);
  const size = '1:1';
  const resolution = resolveOpenAIImageResolution(args.env);
  const imageUrls = args.imageUrls?.length
    ? args.imageUrls
    : [buildImageDataUri(args.imageBase64, args.mimeType || 'image/jpeg')];

  const submitResponse = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: args.prompt,
      n: 1,
      size,
      resolution,
      image_urls: imageUrls,
    }),
  });
  const submitText = await submitResponse.text();
  let submitJson: unknown = null;
  try {
    submitJson = submitText ? JSON.parse(submitText) : null;
  } catch {
    submitJson = null;
  }
  const submitData = submitJson as {
    code?: number;
    data?: Array<{ task_id?: string; status?: string }>;
    message?: string;
    error?: { message?: string };
  } | null;
  const taskId = submitData?.data?.[0]?.task_id;
  if (!submitResponse.ok || submitData?.code !== 200 || !taskId) {
    throw new Error(
      submitData?.error?.message ||
        submitData?.message ||
        submitText ||
        `APIMart gpt-image-2 submit failed (${submitResponse.status})`
    );
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 10_000 : 4_000));
    }
    const resultResponse = await fetch(`${baseUrl}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const resultText = await resultResponse.text();
    let resultJson: unknown = null;
    try {
      resultJson = resultText ? JSON.parse(resultText) : null;
    } catch {
      resultJson = null;
    }
    const resultData = resultJson as {
      code?: number;
      data?: {
        status?: string;
        result?: {
          images?: Array<{ url?: string[] }>;
        };
        error?: { message?: string };
      };
      message?: string;
      error?: { message?: string };
    } | null;
    if (!resultResponse.ok || resultData?.code !== 200) {
      throw new Error(
        resultData?.error?.message ||
          resultData?.message ||
          resultText ||
          `APIMart gpt-image-2 task failed (${resultResponse.status})`
      );
    }
    const status = resultData?.data?.status;
    if (status === 'submitted' || status === 'pending' || status === 'processing') continue;
    if (status === 'completed') {
      const imageUrl = resultData.data?.result?.images?.[0]?.url?.[0];
      if (imageUrl) {
        return { imageUrl, model, backend: 'openai' };
      }
      throw new Error('APIMart gpt-image-2 returned no image URL');
    }
    throw new Error(resultData?.data?.error?.message || `APIMart gpt-image-2 task status: ${status || 'unknown'}`);
  }

  throw new Error('APIMart gpt-image-2 task timed out');
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

async function fetchJimengWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 20_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Jimeng upstream request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const scale = Number.isFinite(parsedScale) && parsedScale > 0
    ? parsedScale <= 1
      ? Math.round(parsedScale * 100)
      : parsedScale <= 100
        ? Math.round(parsedScale)
        : 65
    : 65;
  return { accessKeyId, secretAccessKey, baseUrl, reqKey, region, service, size, scale };
}

async function requestJimengImageEdit(args: {
  env: EchoApiEnv;
  imageUrls: string[];
  prompt: string;
  onStage?: (stage: string) => void;
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
    prompt: args.prompt.slice(0, 800),
    force_single: true,
    size: conf.size,
    scale: conf.scale,
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
  args.onStage?.('jimeng-submit-fetch');
  const submitResponse = await fetchJimengWithTimeout(submitRequest.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Sha256': submitSha,
      'X-Date': submitXDate,
      Authorization: submitAuthorization,
    },
    body: submitText,
  });
  args.onStage?.('jimeng-submit-response');
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
    const error = new Error(msg || `Jimeng submit failed (${submitResponse.status})`);
    Object.assign(error, {
      status: submitResponse.status,
      code: submitOut?.code ?? null,
    });
    throw error;
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
    args.onStage?.('jimeng-result-fetch');
    const resultResponse = await fetchJimengWithTimeout(resultRequest.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Sha256': resultSha,
        'X-Date': resultXDate,
        Authorization: resultAuthorization,
      },
      body: resultText,
    });
    args.onStage?.('jimeng-result-response');
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
      const error = new Error(msg || `Jimeng result failed (${resultResponse.status})`);
      Object.assign(error, {
        status: resultResponse.status,
        code: resultOut?.code ?? null,
      });
      throw error;
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
    const baseUrl = resolveOpenAIBaseUrl(args.env);
    if (isApimartOpenAIGateway(baseUrl) && resolveOpenAIImageModel(args.env) === 'gpt-image-2') {
      return requestApimartGptImage2({
        env: args.env,
        imageBase64: args.imageBase64,
        imageUrls: undefined,
        mimeType: args.mimeType,
        prompt: args.prompt,
      });
    }
    const model = resolveOpenAIImageModel(args.env);
  const size = resolveOpenAIImageSize(args.env);
  const quality = resolveOpenAIImageQuality(args.env);
  const imageBytes = Buffer.from(args.imageBase64, 'base64');
  const form = new FormData();
  form.append('model', model);
  form.append(
    'image[]',
    new Blob([imageBytes], { type: args.mimeType || 'image/jpeg' }),
    `upload.${(args.mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`
  );
  form.append('prompt', args.prompt);
  form.append('size', size);
  form.append('quality', quality);
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');
  form.append('input_fidelity', 'high');

  const call = async (withoutInputFidelity = false) => {
    if (withoutInputFidelity) form.delete('input_fidelity');
    const r = await fetch(`${baseUrl}/images/edits`, {
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
    const credentials = parseGoogleServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      apiVersion: 'v1',
      ...(credentials ? { googleAuthOptions: { credentials } } : {}),
    });
  }
  if (key) return new GoogleGenAI({ apiKey: key });
  return null;
}

function resolveImageModel(env: EchoApiEnv): string {
  const explicit = env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  return 'gemini-3.1-flash-lite-image';
}

function isBuildingStyleId(s: string | undefined | null): s is BuildingStyleId {
  return s != null && (BUILDING_STYLE_IDS as readonly string[]).includes(s);
}

function buildEchoImageSystemInstruction(style: BuildingStyleId = DEFAULT_BUILDING_STYLE): string {
  const base =
    '输入照片只作为建筑结构参考，不要保留、拼接或复刻原照片的整张画面。先定位主体建筑的真实像素范围，只针对主体建筑本身创建一个完整、独立的地标建筑立绘；忽略并彻底删除建筑以外的所有内容。输入图中的棋盘格透明预览、白色背景、天空、地面、人物、游客、车辆、植被、招牌、文字、聊天窗口、评论区、按钮、应用界面、截图边框、虚线、圆弧、标记、Logo、水印和任何其他 UI 残片都不是建筑内容，绝对不能出现在输出中。必须从屋顶最高点一直完整呈现到地基、底座或台阶，包含建筑的完整主体、屋顶、墙体、立面、支撑结构、入口和底部轮廓；不得裁切顶部、底部、左右两侧，不得只生成局部立面、门窗、屋顶或建筑碎片，不得让任何 UI、卡片、图标或物体遮挡建筑。即使输入照片有遮挡，也要根据可见结构合理补全被遮挡的建筑部分，保持比例、透视和结构连续，不能输出半透明、褪色、幽灵化或悬空的建筑。建筑应居中完整地放在画布中，四周保留约 8%–12% 的透明安全边距，主体占画布高度约 65%–85%，确保完整轮廓清楚可见。必须抠出建筑轮廓并重绘为单体建筑资产，边缘干净、无背景残留、无光晕、无阴影、无外框；输出画布除建筑主体像素外全部为真正透明区域，禁止白色、彩色或灰色背景，优先输出带 alpha 通道的透明 PNG，不要绘制棋盘格来模拟透明。只输出一张完整建筑图，不要输出解释、文字、场景拼贴或多个对象。构图为干净的等距/3D 视角，保留建筑主体轮廓、屋顶、体块和地标识别度。整体必须像可收藏的旅行地标建筑插画，而不是照片拼贴、儿童画、玩具、贴纸、Q版摆件或卡通表情。颜色克制，避免高饱和霓虹糖果色，避免幼态、廉价、花哨。';
  void style;
  return base;
}

function buildInitialUserPrompt(buildingName?: string): string {
  return buildInitialUserPromptWithStyle(buildingName, DEFAULT_BUILDING_STYLE);
}

function buildUserStyleReminder(style: BuildingStyleId): string {
  switch (style) {
    case 'pixel':
      return '精致等距像素建筑风。像素块必须清晰可见，结构规整，限制色盘，偏旅行游戏地图资产质感。禁止平滑渐变、模糊、厚涂、Q版玩具感、荧光高饱和儿童手游皮肤风。';
    case 'ink':
      return '水墨白描建筑风。以墨线、淡墨、极低饱和矿物淡彩为主，强调建筑轮廓、屋顶、窗洞和体块关系，气质克制安静。禁止高饱和儿童插画配色、可爱卡通脸、贴纸感。';
    case 'healing':
      return '治愈旅行绘本插画风。柔和、低饱和、纸面质感，像成熟旅行手账或杂志插画；可以有轻微彩铅/蜡笔/水粉肌理，但建筑结构要准。禁止幼态儿童画、糖果色、玩具摆件感。';
    case 'flat':
    default:
      return '高级扁平建筑插画风。几何块面清晰、边缘干净、配色克制偏杂志编辑插画，适合地图地标收藏。禁止儿童简笔画、过亮高饱和、表情贴纸、廉价卡通风。';
  }
}

function resolveStylePrompt(style: BuildingStyleId, customPrompt?: string): string {
  const prompt = customPrompt?.trim();
  return prompt && prompt.length <= MAX_STYLE_PROMPT_LENGTH
    ? prompt
    : DEFAULT_BUILDING_STYLE_PROMPTS[style];
}

function buildInitialUserPromptWithStyle(
  buildingName: string | undefined,
  style: BuildingStyleId,
  stylePrompt?: string
): string {
  const trimmed = buildingName?.trim();
  const extractionInstruction =
    '请把输入照片中的主体建筑提取为独立建筑资产；输入照片只用于识别建筑外形和细节，输出画面不能包含原照片背景、人物、天空、地面、游客、车辆、招牌或场景拼贴。';
  const styleRequirement = resolveStylePrompt(style, stylePrompt);
  return trimmed
    ? `建筑名称参考：${trimmed}。${extractionInstruction} 请保留原建筑的核心轮廓、体块、屋顶和可识别地标特征，只重绘风格，不要改造成完全陌生的幻想建筑。风格要求：${styleRequirement}`
    : `${extractionInstruction} 请保留原建筑的核心轮廓、体块、屋顶和可识别地标特征，只重绘风格，不要改造成完全陌生的幻想建筑。风格要求：${styleRequirement}`;
}

function buildEditUserPrompt(
  editInstruction: string,
  buildingName?: string,
  style: BuildingStyleId = DEFAULT_BUILDING_STYLE,
  stylePrompt?: string
): string {
  const extra = buildingName?.trim() ? ` 建筑名称参考：${buildingName.trim()}。` : '';
  return `${editInstruction.trim()}${extra} 输入照片只作为建筑结构参考，输出不能包含原照片背景、人物、天空、地面、游客、车辆、招牌或场景拼贴。请保留原建筑的可识别地标特征，只在现有结构上调整。风格要求：${resolveStylePrompt(style, stylePrompt)}`.trim();
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
  if (req.method === 'GET' && req.query.health === '1') {
    await echoHealthHandler(req, res);
    return;
  }

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
    styleName?: string;
    stylePrompt?: string;
    preferredModel?: 'gemini' | 'jimeng' | 'chatgpt-image';
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

  if (body.stylePrompt != null && typeof body.stylePrompt !== 'string') {
    sendJson(res, 400, { error: 'stylePrompt must be a string', code: 'STYLE_PROMPT_INVALID' });
    return;
  }
  if (body.stylePrompt && body.stylePrompt.trim().length > MAX_STYLE_PROMPT_LENGTH) {
    sendJson(res, 400, {
      error: `stylePrompt is too long (maximum ${MAX_STYLE_PROMPT_LENGTH} characters)`,
      code: 'STYLE_PROMPT_TOO_LONG',
    });
    return;
  }

  const requestId = randomUUID();
  res.setHeader('X-Echo-Request-Id', requestId);
  const quotaUserId = await authorizeGeneration(req, res);
  if (isQuotaEnabled() && !quotaUserId) return;

  let providerStage = 'provider-setup';
  try {
    const env = envFromProcess();
    const wantsJimeng = body.preferredModel === 'jimeng';
    const wantsOpenAI = body.preferredModel === 'chatgpt-image';
    const provider = wantsOpenAI ? 'ChatGPT Image' : wantsJimeng ? 'Jimeng' : 'Gemini';
    providerStage = 'provider-client-init';
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
        ? buildEditUserPrompt(body.userPrompt, body.buildingName, buildingStyle, body.stylePrompt)
        : buildInitialUserPromptWithStyle(body.buildingName, buildingStyle, body.stylePrompt);
    const userText = baseUserText;
    const stitchedPrompt = [
      'System constraints:',
      buildEchoImageSystemInstruction(buildingStyle),
      '',
      'User request:',
      userText,
    ].join('\n');

    if (wantsOpenAI) {
      providerStage = 'chatgpt-image-edit';
      const openai = await requestOpenAIImageEdit({
        env,
        imageBase64: body.imageBase64,
        mimeType: body.mimeType || 'image/jpeg',
        prompt: stitchedPrompt,
      });
      providerStage = 'quota-consume';
      const entitlement = await consumeQuotaForSuccess(quotaUserId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          imageUrl: openai.imageUrl,
          model: openai.model,
          requestedModel: body.preferredModel || 'gemini',
          backend: openai.backend,
          entitlement,
        })
      );
      return;
    }
    if (wantsJimeng) {
      const serverImageUrl = await uploadJimengInputFromBase64({
        env,
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
      });
      const jimeng = await requestJimengImageEdit({
        env,
        imageUrls: serverImageUrl ? [serverImageUrl] : body.imageUrls ?? [],
        prompt: buildJimengPrompt({
          buildingName: body.buildingName,
          stylePrompt: body.stylePrompt || DEFAULT_BUILDING_STYLE_PROMPTS[buildingStyle],
          userPrompt: body.userPrompt,
        }),
        onStage: (stage) => {
          providerStage = stage;
        },
      });
      providerStage = 'quota-consume';
      const entitlement = await consumeQuotaForSuccess(quotaUserId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          imageUrl: jimeng.imageUrl,
          model: jimeng.model,
          requestedModel: body.preferredModel || 'gemini',
          backend: jimeng.backend,
          entitlement,
        })
      );
      return;
    }

    const requestImage = async (promptText: string) => {
      providerStage = 'gemini-generate-content';
      return ai.models.generateContent({
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
    };

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
    providerStage = 'gemini-response-parse';
    let extracted = extractInlineImageFromResponse(toExtractInput(response));
    if ('error' in extracted) {
      const retryPrompt =
        `${stitchedPrompt}\n\n` +
        'Output requirement: return only one generated image. Do not return explanation text. ' +
        'If you cannot comply, still return an image attempt instead of text.';
      providerStage = 'gemini-generate-retry';
      response = await requestImage(retryPrompt);
      providerStage = 'gemini-retry-response-parse';
      extracted = extractInlineImageFromResponse(toExtractInput(response));
    }

    res.statusCode = 'error' in extracted ? 500 : 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    let entitlement: GenerationEntitlement | null = null;
    if (!('error' in extracted)) {
      providerStage = 'quota-consume';
      entitlement = await consumeQuotaForSuccess(quotaUserId);
    }
    res.end(
      JSON.stringify(
        'error' in extracted
          ? (() => {
              const detail = describeProviderError(provider, new Error(extracted.error));
              return { ...detail, error: detail.message, requestId };
            })()
          : {
              imageUrl: extracted.imageUrl,
              model: imageModel,
              requestedModel: body.preferredModel || 'gemini',
              backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai',
              entitlement,
            }
      )
    );
  } catch (e: unknown) {
    const requestedProvider =
      body.preferredModel === 'jimeng'
        ? 'Jimeng'
        : body.preferredModel === 'chatgpt-image'
          ? 'ChatGPT Image'
          : 'Gemini';
    const detail = describeProviderError(requestedProvider, e);
    const env = envFromProcess();
    const model =
      body.preferredModel === 'jimeng'
        ? resolveJimengConfig(env).reqKey
        : body.preferredModel === 'chatgpt-image'
          ? resolveOpenAIImageModel(env)
          : resolveImageModel(env);
    console.error(
      '[generation] provider failure',
      JSON.stringify({
        requestId,
        provider: requestedProvider,
        model,
        stage: providerStage,
        ...detail,
        runtime: getProviderErrorRuntimeInfo(e),
      })
    );
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ...detail, error: detail.message, requestId }));
  }
}

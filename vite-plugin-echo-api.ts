import type { Plugin } from 'vite';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Modality } from '@google/genai';
import { createHash, createHmac } from 'node:crypto';
import { buildInitialUserPrompt, buildEditUserPrompt } from './prompts/echoImageGen';
import {
  buildEchoImageSystemInstruction,
  DEFAULT_BUILDING_STYLE,
  isBuildingStyleId,
} from './prompts/buildingStyle';

const MAX_JSON_BODY_CHARS = 22 * 1024 * 1024; // ~16MB binary as base64 upper bound guard

export interface EchoApiEnv {
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
  VITE_AMAP_WEB_KEY?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  /**
   * Vertex 上用于出图的模型 ID（与控制台「任务」下拉无关，见 resolveImageModel 注释）。
   * 例：gemini-2.5-flash-image（默认 GA）、gemini-3.1-flash-image-preview（Nano Banana 2）
   */
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
  ECHO_PREFER_API_KEY?: string;
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
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');

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

async function requestOpenAIImageEdit(args: {
  env: EchoApiEnv;
  imageBase64: string;
  mimeType: string;
  prompt: string;
}): Promise<{ imageUrl: string; model: string; backend: 'openai' }> {
  const apiKey = args.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');

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

  const request = async (withoutInputFidelity = false) => {
    if (withoutInputFidelity) form.delete('input_fidelity');
    const r = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
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

  let out = await request(false);
  if (!out.r.ok && out.r.status === 400 && out.text.includes('input_fidelity')) {
    out = await request(true);
  }
  if (!out.r.ok) {
    throw new Error(
      typeof (out.json as { error?: { message?: string } } | null)?.error?.message === 'string'
        ? (out.json as { error: { message: string } }).error.message
        : `OpenAI image edit failed (${out.r.status})`
    );
  }
  const first = (out.json as { data?: Array<{ b64_json?: string; url?: string }> } | null)?.data?.[0];
  if (first?.b64_json) {
    return { imageUrl: `data:image/png;base64,${first.b64_json}`, model, backend: 'openai' };
  }
  if (first?.url) {
    return { imageUrl: first.url, model, backend: 'openai' };
  }
  throw new Error('OpenAI returned no image data');
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
  const submitOut = submitJson as { code?: number; data?: { task_id?: string }; message?: string; request_id?: string } | null;
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
    if (status === 'in_queue' || status === 'generating') {
      continue;
    }
    if (status !== 'done') {
      throw new Error(`Jimeng task status: ${status || 'unknown'}`);
    }
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

function readBody(req: { on: (ev: string, fn: (...args: unknown[]) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => {
      data += c;
    });
    req.on('end', () => {
      if (data.length > MAX_JSON_BODY_CHARS) {
        reject(new Error('payload too large'));
        return;
      }
      resolve(data);
    });
    req.on('error', reject);
  });
}

/** Nominatim 无结果或不可达时，用 Open-Meteo 免费地理编码（无需 key，对部分网络更友好） */
async function geocodeOpenMeteo(q: string): Promise<{
  lat: number;
  lng: number;
  display_name: string;
} | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (dev)' } });
  if (!r.ok) {
    logLine('geocode_openmeteo_http', { status: r.status, q });
    return null;
  }
  const j = (await r.json()) as {
    results?: Array<{
      name?: string;
      admin1?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      population?: number;
    }>;
  };
  const list = j.results;
  if (!list?.length) return null;
  const qLow = q.toLowerCase();
  const hit =
    [...list].sort((a, b) => {
      const popA = typeof a.population === 'number' ? a.population : 0;
      const popB = typeof b.population === 'number' ? b.population : 0;
      const nameA = [a.name, a.admin1, a.country].filter(Boolean).join(', ').toLowerCase();
      const nameB = [b.name, b.admin1, b.country].filter(Boolean).join(', ').toLowerCase();
      const ma = nameA.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameA.includes(t));
      const mb = nameB.includes(qLow) || qLow.split(/[\s,，]+/).some((t) => t.length > 1 && nameB.includes(t));
      if (ma !== mb) return ma ? -1 : 1;
      return popB - popA;
    })[0] ?? list[0];
  if (
    !hit ||
    typeof hit.latitude !== 'number' ||
    typeof hit.longitude !== 'number' ||
    !Number.isFinite(hit.latitude) ||
    !Number.isFinite(hit.longitude)
  ) {
    return null;
  }
  const display_name = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ') || q;
  return { lat: hit.latitude, lng: hit.longitude, display_name };
}

async function geocodeAmap(q: string, env: EchoApiEnv): Promise<{
  lat: number;
  lng: number;
  display_name: string;
} | null> {
  const key = env.VITE_AMAP_WEB_KEY?.trim() || process.env.VITE_AMAP_WEB_KEY?.trim() || process.env.AMAP_WEB_KEY?.trim() || '';
  if (!key) return null;
  const url =
    `https://restapi.amap.com/v3/geocode/geo?output=json&key=${encodeURIComponent(key)}` +
    `&address=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (dev)' } });
  if (!r.ok) {
    logLine('geocode_amap_http', { status: r.status, q });
    return null;
  }
  const j = (await r.json()) as {
    status?: string;
    geocodes?: Array<{
      location?: string;
      formatted_address?: string;
      province?: string;
      city?: string | string[];
      district?: string;
    }>;
  };
  if (j.status !== '1' || !j.geocodes?.length) return null;
  const hit = j.geocodes[0];
  const [lngText, latText] = String(hit.location || '').split(',');
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cityValue = hit.city;
  const city =
    typeof cityValue === 'string'
      ? cityValue
      : Array.isArray(cityValue)
        ? cityValue.find((item): item is string => typeof item === 'string' && item.length > 0) || ''
        : '';
  return {
    lat,
    lng,
    display_name:
      hit.formatted_address || [hit.province, city, hit.district].filter(Boolean).join(', ') || q,
  };
}

/** 在多条 Nominatim 结果中选最优：importance + 与查询词重合度，减少「整市 bbox」误中区县名的情况 */
function pickBestNominatimHit(
  data: Array<{
    lat: string;
    lon: string;
    display_name: string;
    importance?: number;
    class?: string;
    type?: string;
  }>,
  rawQuery: string
): (typeof data)[0] | null {
  if (!data.length) return null;
  const q = rawQuery.toLowerCase();
  const tokens = q.split(/[\s,，、]+/).filter((t) => t.length >= 2);
  const scored = data.map((hit, idx) => {
    const imp = typeof hit.importance === 'number' && Number.isFinite(hit.importance) ? hit.importance : 0;
    const dn = (hit.display_name || '').toLowerCase();
    let bonus = 0;
    for (const t of tokens) {
      if (dn.includes(t)) bonus += 0.12;
    }
    if (hit.class === 'boundary' && hit.type === 'administrative') bonus += 0.04;
    if (hit.type === 'administrative' || hit.type === 'city' || hit.type === 'town') bonus += 0.02;
    return { hit, score: imp + bonus, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored[0]?.hit ?? null;
}

function logLine(kind: string, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    kind,
    ...payload,
  });
  console.info(`[echo-api] ${line}`);
  try {
    const dir = path.join(process.cwd(), 'logs');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'echo-api.log'), line + '\n', { encoding: 'utf8' });
  } catch {
    /* ignore file log failures (e.g. read-only fs) */
  }
}

function applyCredentialsEnv(env: EchoApiEnv) {
  const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (cred) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.isAbsolute(cred)
      ? cred
      : path.resolve(process.cwd(), cred);
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
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      apiVersion: 'v1',
    });
  }
  if (key) {
    return new GoogleGenAI({ apiKey: key });
  }
  return null;
}

/**
 * 默认用 Vertex 文档中的 GA 模型 `gemini-2.5-flash-image`。
 * 旧名 `gemini-2.5-flash-image-preview` 会 404，勿用。
 * Nano Banana 2 对应 `gemini-3.1-flash-image-preview`（预览，需在项目/区域可用）。
 */
function resolveImageModel(env: EchoApiEnv): string {
  const explicit = env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  if (env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim()) {
    return 'gemini-2.5-flash-image-preview';
  }
  return 'gemini-2.5-flash-image';
}

/** 从 generateContent 响应中提取第一张内联图片；失败时返回可展示的诊断信息 */
function extractInlineImageFromResponse(response: {
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string; safetyRatings?: unknown[] };
  candidates?: Array<{
    finishReason?: string;
    finishMessage?: string;
    safetyRatings?: unknown[];
    content?: { parts?: Array<Record<string, unknown>> };
  }>;
  data?: string;
  text?: string;
}): { imageUrl: string } | { error: string; logPayload: Record<string, unknown> } {
  const pf = response.promptFeedback;
  if (pf?.blockReason) {
    const msg = [
      `Prompt blocked (${pf.blockReason})`,
      pf.blockReasonMessage ? String(pf.blockReasonMessage) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      error: msg,
      logPayload: { reason: 'prompt_blocked', blockReason: pf.blockReason },
    };
  }

  const candidates = response.candidates;
  if (!candidates?.length) {
    return {
      error: 'No candidates returned (empty or filtered). Check promptFeedback / model availability.',
      logPayload: { reason: 'no_candidates', hasPromptFeedback: Boolean(pf) },
    };
  }

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    const parts = cand.content?.parts;
    if (!parts?.length) {
      continue;
    }
    for (const part of parts) {
      const inline = part.inlineData as { data?: string; mimeType?: string } | undefined;
      const raw = inline?.data;
      const mime = inline?.mimeType || 'image/png';
      if (raw && typeof raw === 'string') {
        return { imageUrl: `data:${mime};base64,${raw}` };
      }
    }
  }

  // SDK 聚合 getter：部分版本下手写遍历未命中时可仍取到 base64
  const fromGetter = response.data;
  if (typeof fromGetter === 'string' && fromGetter.length > 0) {
    const parts = candidates[0]?.content?.parts;
    const mime =
      parts?.map((p) => (p.inlineData as { mimeType?: string } | undefined)?.mimeType).find(Boolean) ||
      'image/png';
    return { imageUrl: `data:${mime};base64,${fromGetter}` };
  }

  const c0 = candidates[0];
  const textPart = c0?.content?.parts?.find((p) => typeof p.text === 'string')?.text as string | undefined;
  const modelNote = response.text || textPart;
  const partSummary =
    c0?.content?.parts?.map((p) => {
      const keys = Object.keys(p).filter((k) => p[k] != null && k !== 'thought');
      return keys.join('+');
    }) ?? [];

  const errorBits = [
    modelNote ? `Model text: ${modelNote.slice(0, 200)}${modelNote.length > 200 ? '…' : ''}` : null,
    c0?.finishReason ? `finishReason=${c0.finishReason}` : null,
    c0?.finishMessage ? `finishMessage=${String(c0.finishMessage).slice(0, 120)}` : null,
  ].filter(Boolean);

  const err =
    errorBits.join(' · ') ||
    'No image in API response (no inlineData parts).';

  return {
    error: err,
    logPayload: {
      reason: 'no_inline_image',
      candidateCount: candidates.length,
      finishReason: c0?.finishReason,
      finishMessage: c0?.finishMessage,
      partSummary,
      safetyFirst: c0?.safetyRatings,
    },
  };
}

/**
 * Dev / preview：
 * - POST /api/generate → Google Gemini（Vertex 或 GEMINI_API_KEY）
 * - POST /api/geocode → 优先高德 Web 服务，其次回退到 Nominatim / Open-Meteo
 * - GET  /api/echo-health → 检查本地 API 与生成凭证是否就绪
 */
export function echoApiPlugin(env: EchoApiEnv): Plugin {
  const imageModel = resolveImageModel(env);
  let aiSingleton: GoogleGenAI | null | undefined;

  const getAi = () => {
    if (aiSingleton !== undefined) return aiSingleton;
    try {
      aiSingleton = createGenAI(env);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logLine('createGenAI_error', { error: msg });
      aiSingleton = null;
    }
    return aiSingleton;
  };

  const resolvedCredentialsPath = (): string | null => {
    const cred = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (!cred) return null;
    return path.isAbsolute(cred) ? cred : path.resolve(process.cwd(), cred);
  };

  const attach = (middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) => {
    middlewares.use(async (req, res, next) => {
      const pathname = req.url?.split('?')[0] ?? '';
      if (!pathname.startsWith('/api/')) {
        next();
        return;
      }

      if (pathname === '/api/echo-health' && req.method === 'GET') {
        try {
          const credPath = resolvedCredentialsPath();
          const credentialsFileExists = credPath ? existsSync(credPath) : false;
          const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT?.trim());
          const hasCredVar = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
          const hasGeminiKey = Boolean(env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim());
          const hasOpenAiKey = Boolean(env.OPENAI_API_KEY?.trim());
          const hasJimengKeys = Boolean(
            env.JIMENG_ACCESS_KEY_ID?.trim() && env.JIMENG_SECRET_ACCESS_KEY?.trim()
          );
          const ai = getAi();
          const providers = {
            gemini: Boolean(ai),
            'chatgpt-image': hasOpenAiKey,
            jimeng: hasJimengKeys,
          } as const;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              ok: true,
              echoApi: true,
              /** 为 true 时 POST /api/generate 才会成功（否则 503） */
              generateConfigured: Object.values(providers).some(Boolean),
              providers,
              /** 以下为诊断字段（不含密钥内容） */
              env: {
                hasGoogleCloudProject: hasProject,
                hasGoogleApplicationCredentials: hasCredVar,
                credentialsFileExists,
                credentialsResolvedPath: credPath,
                hasGeminiApiKey: hasGeminiKey,
                hasOpenAiKey,
                hasJimengKeys,
                googleCloudLocation: (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim(),
              },
              geocode: env.VITE_AMAP_WEB_KEY?.trim() ? 'amap' : 'nominatim+open-meteo',
              imageModel,
              message:
                ai == null && !hasOpenAiKey && !hasJimengKeys
                  ? hasProject && hasCredVar && !credentialsFileExists
                    ? 'GOOGLE_APPLICATION_CREDENTIALS path not found on disk — check the file path in echomap-web/.env'
                    : 'Set GEMINI_API_KEY, OPENAI_API_KEY, JIMENG_ACCESS_KEY_ID + JIMENG_SECRET_ACCESS_KEY, or GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS in echomap-web/.env'
                  : 'POST /api/generate available',
            })
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
        return;
      }

      if (req.method !== 'POST') {
        next();
        return;
      }

      if (pathname === '/api/generate') {
        const reqId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const t0 = Date.now();
        let raw = '';
        try {
          raw = await readBody(req);
        } catch (e) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'payload too large' }));
          logLine('generate_reject', { reqId, reason: 'payload_too_large' });
          return;
        }

        try {
          const body = JSON.parse(raw) as {
            imageBase64?: string;
            imageUrls?: string[];
            mimeType?: string;
            prompt?: string;
            buildingName?: string;
            userPrompt?: string;
            /** flat | pixel | ink | healing */
            buildingStyle?: string;
            /** gemini | jimeng | chatgpt-image */
            preferredModel?: 'gemini' | 'jimeng' | 'chatgpt-image';
          };
          if (!body.imageBase64) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'imageBase64 required' }));
            return;
          }

          const wantsJimeng = body.preferredModel === 'jimeng';
          const wantsOpenAI = body.preferredModel === 'chatgpt-image';
          const ai = wantsOpenAI || wantsJimeng ? null : getAi();
          if (!wantsOpenAI && !wantsJimeng && !ai) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  'No AI client: set GOOGLE_CLOUD_PROJECT (+ GOOGLE_APPLICATION_CREDENTIALS for Vertex), GEMINI_API_KEY, OPENAI_API_KEY, or JIMENG_ACCESS_KEY_ID + JIMENG_SECRET_ACCESS_KEY in .env',
              })
            );
            logLine('generate_config_error', { reqId, reason: 'no_client' });
            return;
          }

          const buildingStyle = isBuildingStyleId(body.buildingStyle)
            ? body.buildingStyle
            : DEFAULT_BUILDING_STYLE;
          const directPrompt = body.prompt?.trim();
          const baseUserText = directPrompt
            ? directPrompt
            : body.userPrompt?.trim()
              ? buildEditUserPrompt(body.userPrompt, body.buildingName, buildingStyle)
              : buildInitialUserPrompt(body.buildingName, buildingStyle);
          const userText = baseUserText;
          const systemInstruction = buildEchoImageSystemInstruction(buildingStyle);
          const stitchedPrompt = [
            'System constraints:',
            systemInstruction,
            '',
            'User request:',
            userText,
          ].join('\n');

          logLine('generate_start', {
            reqId,
            model: wantsOpenAI
              ? resolveOpenAIImageModel(env)
              : wantsJimeng
                ? resolveJimengConfig(env).reqKey
                : imageModel,
            requestedModel: body.preferredModel || 'gemini',
            buildingStyle,
            backend: wantsOpenAI
              ? 'openai'
              : wantsJimeng
                ? 'jimeng'
                : env.GOOGLE_CLOUD_PROJECT
                  ? 'vertex'
                  : 'api_key',
            project: env.GOOGLE_CLOUD_PROJECT || null,
            hasBuildingName: Boolean(body.buildingName?.trim()),
            mode: directPrompt ? 'direct' : body.userPrompt ? 'edit' : 'initial',
          });

          if (wantsOpenAI) {
            const openai = await requestOpenAIImageEdit({
              env,
              imageBase64: body.imageBase64,
              mimeType: body.mimeType || 'image/jpeg',
              prompt: stitchedPrompt,
            });
            const ms = Date.now() - t0;
            logLine('generate_ok', { reqId, ms, model: openai.model, backend: 'openai' });
            res.setHeader('Content-Type', 'application/json');
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
            const ms = Date.now() - t0;
            logLine('generate_ok', { reqId, ms, model: jimeng.model, backend: 'jimeng' });
            res.setHeader('Content-Type', 'application/json');
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
                systemInstruction,
                responseModalities: [Modality.IMAGE],
              },
            });

          let response = await requestImage(stitchedPrompt);
          let extracted = extractInlineImageFromResponse(response as Record<string, unknown>);
          if ('error' in extracted) {
            const retryPrompt =
              `${stitchedPrompt}\n\n` +
              'Output requirement: return only one generated image. Do not return explanation text. ' +
              'If you cannot comply, still return an image attempt instead of text.';
            response = await requestImage(retryPrompt);
            extracted = extractInlineImageFromResponse(response as Record<string, unknown>);
          }
          if ('error' in extracted) {
            logLine('generate_no_image', { reqId, ...extracted.logPayload, error: extracted.error });
            throw new Error(extracted.error);
          }
          const imageUrl = extracted.imageUrl;

          const ms = Date.now() - t0;
          logLine('generate_ok', { reqId, ms, model: imageModel });

          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              imageUrl,
              model: imageModel,
              requestedModel: body.preferredModel || 'gemini',
              backend: env.GOOGLE_CLOUD_PROJECT ? 'vertex-ai' : 'google-genai',
            })
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logLine('generate_error', { reqId, ms: Date.now() - t0, error: msg });
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      if (pathname === '/api/geocode') {
        const raw = await readBody(req);
        try {
          const body = JSON.parse(raw) as { query?: string; centerFromBbox?: boolean };
          const q = String(body.query || '').trim();
          const centerFromBbox = body.centerFromBbox !== false;
          if (!q) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'query required' }));
            return;
          }

          let lat: number | undefined;
          let lng: number | undefined;
          let display_name: string | undefined;
          let provider: 'amap' | 'nominatim' | 'open-meteo' | undefined;

          try {
            const amap = await geocodeAmap(q, env);
            if (amap) {
              lat = amap.lat;
              lng = amap.lng;
              display_name = amap.display_name;
              provider = 'amap';
              logLine('geocode_ok', { q, provider: 'amap' });
            }
          } catch (e: unknown) {
            logLine('geocode_amap_error', { q, error: e instanceof Error ? e.message : String(e) });
          }

          try {
            if (lat != null && lng != null) {
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  found: true,
                  lat,
                  lng,
                  display_name,
                  provider,
                })
              );
              return;
            }
            const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=10`;
            const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0 (dev)' } });
            if (r.ok) {
              const data = (await r.json()) as Array<{
                lat: string;
                lon: string;
                display_name: string;
                importance?: number;
                class?: string;
                type?: string;
                boundingbox?: [string, string, string, string];
              }>;
              const hit = pickBestNominatimHit(Array.isArray(data) ? data : [], q);
              if (hit) {
                let la = parseFloat(hit.lat);
                let ln = parseFloat(hit.lon);
                if (
                  centerFromBbox &&
                  hit.boundingbox &&
                  Array.isArray(hit.boundingbox) &&
                  hit.boundingbox.length >= 4
                ) {
                  const south = parseFloat(hit.boundingbox[0]);
                  const north = parseFloat(hit.boundingbox[1]);
                  const west = parseFloat(hit.boundingbox[2]);
                  const east = parseFloat(hit.boundingbox[3]);
                  if ([south, north, west, east].every((n) => Number.isFinite(n))) {
                    la = (south + north) / 2;
                    ln = (west + east) / 2;
                  }
                }
                lat = la;
                lng = ln;
                display_name = hit.display_name;
                provider = 'nominatim';
              }
            } else {
              logLine('geocode_nominatim_http', { status: r.status, q });
            }
          } catch (e: unknown) {
            logLine('geocode_nominatim_error', { q, error: e instanceof Error ? e.message : String(e) });
          }

          if (lat == null || lng == null) {
            const om = await geocodeOpenMeteo(q);
            if (om) {
              lat = om.lat;
              lng = om.lng;
              display_name = om.display_name;
              provider = 'open-meteo';
              logLine('geocode_ok', { q, provider: 'open-meteo' });
            }
          } else {
            logLine('geocode_ok', { q, provider: 'nominatim' });
          }

          if (lat != null && lng != null && display_name) {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                found: true,
                lat,
                lng,
                display_name,
                provider,
              })
            );
            return;
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ found: false, provider: null }));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: msg }));
        }
        return;
      }

      next();
    });
  };

  return {
    name: 'echo-api',
    configureServer(server) {
      attach(server.middlewares);
      server.httpServer?.once('listening', () => {
        console.info(
          '[echo-api] Ready: GET /api/echo-health · POST /api/generate · POST /api/geocode (use this dev server URL, not file:// or raw dist/)'
        );
      });
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
      server.httpServer?.once('listening', () => {
        console.info('[echo-api] Preview: same APIs as dev — open the printed http:// URL');
      });
    },
  };
}

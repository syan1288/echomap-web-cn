import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { isGeminiProviderAvailable } from '../shared/domain/image/providerAvailability.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseGoogleServiceAccountJson } from '../shared/domain/googleServiceAccount.js';

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
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GEMINI_IMAGE_MODEL?: string;
  ECHO_IMAGE_MODEL?: string;
};

type GeminiTokenProbe = {
  mode: 'vertex' | 'apiKey' | 'none';
  ok: boolean;
  detail?: string;
};

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
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL,
    ECHO_IMAGE_MODEL: process.env.ECHO_IMAGE_MODEL,
  };
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
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const location = (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim();
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
  const key = env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim();
  if (key) return new GoogleGenAI({ apiKey: key });
  return null;
}

function resolveImageModel(env: EchoApiEnv): string {
  return env.GEMINI_IMAGE_MODEL?.trim() || env.ECHO_IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image';
}

function resolveOpenAIImageModel(env: EchoApiEnv): string {
  const explicit = env.OPENAI_IMAGE_MODEL?.trim();
  if (explicit) return explicit;
  if (resolveOpenAIBaseUrl(env).includes('api.apimart.ai')) return 'gpt-image-2';
  return 'chatgpt-image-latest';
}

function resolveOpenAIBaseUrl(env: EchoApiEnv): string {
  return env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
}

function resolveOpenAIImageSize(env: EchoApiEnv): string {
  return env.OPENAI_IMAGE_SIZE?.trim() || '1024x1024';
}

function resolveOpenAIImageQuality(env: EchoApiEnv): string {
  return env.OPENAI_IMAGE_QUALITY?.trim() || 'medium';
}

function resolveOpenAIImageResolution(env: EchoApiEnv): string {
  return env.OPENAI_IMAGE_RESOLUTION?.trim() || '1k';
}

function resolveJimengImageModel(env: EchoApiEnv): string {
  return env.JIMENG_REQ_KEY?.trim() || 'jimeng_seedream46_cvtob';
}

async function probeGeminiToken(env: EchoApiEnv): Promise<GeminiTokenProbe> {
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  const hasApiKey = Boolean(env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim());

  if (!project) {
    if (hasApiKey) {
      return { mode: 'apiKey', ok: true, detail: 'Gemini API key mode does not require OAuth token exchange.' };
    }
    return { mode: 'none', ok: false, detail: 'No Gemini credentials configured.' };
  }

  applyCredentialsEnv(env);

  try {
    const probe = (async () => {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        ...(() => {
          const credentials = parseGoogleServiceAccountJson(env.GOOGLE_SERVICE_ACCOUNT_JSON);
          return credentials ? { credentials } : {};
        })(),
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      const value =
        typeof token === 'string'
          ? token
          : token && typeof token === 'object' && 'token' in token
            ? token.token
            : null;
      if (!value) {
        throw new Error('GoogleAuth returned an empty access token.');
      }
      return { mode: 'vertex', ok: true, detail: 'Successfully exchanged a Google OAuth access token.' } satisfies GeminiTokenProbe;
    })();

    const timeout = new Promise<GeminiTokenProbe>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out requesting token from oauth2.googleapis.com.')), 8000)
    );
    return await Promise.race([probe, timeout]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { mode: 'vertex', ok: false, detail };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;
  applyCors(req, res);

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  try {
    const env = envFromProcess();
    const credPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    const credentialsFileExists = credPath && !credPath.startsWith('{') ? existsSync(credPath) : false;
    const hasProject = Boolean(env.GOOGLE_CLOUD_PROJECT?.trim());
    const hasCredVar = Boolean(env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
    const hasGeminiKey = Boolean(env.GEMINI_API_KEY?.trim() || env.API_KEY?.trim());
    const hasOpenAiKey = Boolean(env.OPENAI_API_KEY?.trim());
    const hasJimengKeys = Boolean(env.JIMENG_ACCESS_KEY_ID?.trim() && env.JIMENG_SECRET_ACCESS_KEY?.trim());
    const ai = createGenAI(env);
    const geminiTokenProbe = await probeGeminiToken(env);
    const imageModel = resolveImageModel(env);
    const providers = {
      gemini: isGeminiProviderAvailable(Boolean(ai), geminiTokenProbe),
      'chatgpt-image': hasOpenAiKey,
      jimeng: hasJimengKeys,
    } as const;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: true,
        echoApi: true,
        generateConfigured: Object.values(providers).some(Boolean),
        providers,
        probes: {
          geminiToken: geminiTokenProbe,
        },
        env: {
          hasGoogleCloudProject: hasProject,
          hasGoogleApplicationCredentials: hasCredVar,
          credentialsFileExists,
          hasGeminiApiKey: hasGeminiKey,
          hasOpenAiKey,
          hasJimengKeys,
          googleCloudLocation: (env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim(),
        },
        geocode: process.env.VITE_AMAP_WEB_KEY?.trim() || process.env.AMAP_WEB_KEY?.trim() ? 'amap' : 'nominatim+open-meteo',
        imageModel,
        openAiBaseUrl: resolveOpenAIBaseUrl(env),
        openAiImageModel: resolveOpenAIImageModel(env),
        openAiImageSize: resolveOpenAIImageSize(env),
        openAiImageQuality: resolveOpenAIImageQuality(env),
        openAiImageResolution: resolveOpenAIImageResolution(env),
        jimengImageModel: resolveJimengImageModel(env),
        message: ai || hasOpenAiKey || hasJimengKeys
          ? geminiTokenProbe.mode === 'vertex' && !geminiTokenProbe.ok
            ? `POST /api/generate available, but Gemini token probe failed: ${geminiTokenProbe.detail}`
            : 'POST /api/generate available'
          : hasProject && hasCredVar && !credentialsFileExists && !env.GOOGLE_SERVICE_ACCOUNT_JSON
            ? 'GOOGLE_APPLICATION_CREDENTIALS path not found — use GOOGLE_SERVICE_ACCOUNT_JSON on Vercel'
            : 'Set GEMINI_API_KEY, OPENAI_API_KEY, JIMENG_ACCESS_KEY_ID + JIMENG_SECRET_ACCESS_KEY, or GOOGLE_CLOUD_PROJECT + credentials (file or GOOGLE_SERVICE_ACCOUNT_JSON)',
      })
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: msg }));
  }
}

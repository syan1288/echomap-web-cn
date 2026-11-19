import { randomUUID } from 'node:crypto';

type JimengImageInputEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function encodePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

/**
 * Upload the source image server-side so Jimeng receives a URL that is
 * reachable from the provider network, instead of a browser-generated URL
 * that may be inaccessible to Volcengine.
 */
export async function uploadJimengInputFromBase64(args: {
  env: JimengImageInputEnv;
  imageBase64?: string;
  mimeType?: string;
}): Promise<string | null> {
  const baseUrl = (args.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (args.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!baseUrl || !serviceKey || !args.imageBase64) return null;

  const mimeType = args.mimeType || 'image/jpeg';
  const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
  const objectPath = `jimeng-inputs/${Date.now()}-${randomUUID()}.${extension}`;
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    'Content-Type': mimeType,
    'x-upsert': 'true',
  };
  const objectUrl = `${baseUrl}/storage/v1/object/buildings/${encodePath(objectPath)}`;
  const uploadResponse = await fetch(objectUrl, {
    method: 'POST',
    headers,
    body: Buffer.from(args.imageBase64, 'base64'),
    signal: AbortSignal.timeout(20_000),
  });
  if (!uploadResponse.ok) {
    throw new Error(`Supabase Jimeng input upload failed (${uploadResponse.status})`);
  }

  const signResponse = await fetch(
    `${baseUrl}/storage/v1/object/sign/buildings/${encodePath(objectPath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  const signBody = (await signResponse.json().catch(() => ({}))) as { signedURL?: string };
  if (!signResponse.ok || !signBody.signedURL) {
    throw new Error(`Supabase Jimeng input signing failed (${signResponse.status})`);
  }

  return signBody.signedURL.startsWith('http')
    ? signBody.signedURL
    : `${baseUrl}/storage/v1${signBody.signedURL}`;
}

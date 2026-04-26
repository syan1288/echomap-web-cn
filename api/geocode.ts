import type { VercelRequest, VercelResponse } from '@vercel/node';

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

async function geocodeAmap(q: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  const key = process.env.VITE_AMAP_WEB_KEY?.trim() || process.env.AMAP_WEB_KEY?.trim() || '';
  if (!key) return null;

  const url =
    `https://restapi.amap.com/v3/geocode/geo?output=json&key=${encodeURIComponent(key)}` +
    `&address=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'EchoMap/1.0' } });
  if (!r.ok) return null;
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

  let body: { query?: string; centerFromBbox?: boolean };
  try {
    body = (typeof input === 'object' ? input : JSON.parse(input)) as typeof body;
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid JSON' }));
    return;
  }

  const q = String(body.query || '').trim();
  const centerFromBbox = body.centerFromBbox !== false;
  if (!q) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'query required' }));
    return;
  }

  try {
    let lat: number | undefined;
    let lng: number | undefined;
    let display_name: string | undefined;
    let provider: 'amap' | undefined;

    const hit = await geocodeAmap(q);
    if (hit) {
      lat = hit.lat;
      lng = hit.lng;
      display_name = hit.display_name;
      provider = 'amap';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify(
        lat == null || lng == null
          ? { found: false, lat: null, lng: null, display_name: q, provider: null }
          : { found: true, lat, lng, display_name: display_name || q, provider }
      )
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: msg }));
  }
}

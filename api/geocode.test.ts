import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './geocode.js';

async function callGeocode(query: string, fetchMock: typeof fetch) {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalCwd = process.cwd();
  const tempCwd = mkdtempSync(path.join(tmpdir(), 'echomap-geocode-test-'));
  globalThis.fetch = fetchMock;
  console.info = () => {};
  process.chdir(tempCwd);

  const responseHeaders: Record<string, string> = {};
  let responseBody = '';
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
      return this;
    },
    end(body = '') {
      responseBody = body;
    },
  } as unknown as VercelResponse;
  const request = {
    method: 'POST',
    body: { query, centerFromBbox: false },
  } as unknown as VercelRequest;

  try {
    await handler(request, response);
    return {
      status: response.statusCode,
      headers: responseHeaders,
      json: JSON.parse(responseBody) as Record<string, unknown>,
    };
  } finally {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    rmSync(tempCwd, { recursive: true, force: true });
  }
}

test('production geocode endpoint uses Nominatim for common Chinese place names', async () => {
  for (const query of ['香港维多利亚港', '故宫', '泉州', 'HKU']) {
    const result = await callGeocode(query, async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'restapi.amap.com') {
        return Response.json({ status: '0', geocodes: [] });
      }
      assert.equal(url.hostname, 'nominatim.openstreetmap.org');
      assert.equal(url.searchParams.get('q'), query);
      return Response.json([
        {
          lat: '39.9163',
          lon: '116.3972',
          display_name: `${query}, China`,
          importance: 0.8,
        },
      ]);
    });

    assert.equal(result.status, 200);
    assert.equal(result.json.found, true);
    assert.equal(result.json.provider, 'nominatim');
    assert.equal(result.json.display_name, `${query}, China`);
  }
});

test('production geocode endpoint falls back to Open-Meteo when Nominatim is unavailable', async () => {
  const result = await callGeocode('泉州', async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'restapi.amap.com') {
      return Response.json({ status: '0', geocodes: [] });
    }
    if (url.hostname === 'nominatim.openstreetmap.org') {
      return new Response('', { status: 503 });
    }
    assert.equal(url.hostname, 'geocoding-api.open-meteo.com');
    return Response.json({
      results: [{ name: '泉州', country: '中国', latitude: 24.8741, longitude: 118.6757 }],
    });
  });

  assert.equal(result.json.found, true);
  assert.equal(result.json.provider, 'open-meteo');
  assert.equal(result.json.lat, 24.8741);
  assert.equal(result.json.lng, 118.6757);
});

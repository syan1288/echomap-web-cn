import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleUsageQuotaRequest, type UsageQuotaApiEnv } from './usageQuotaApiCore.js';

function testEnv(dir: string, overrides: Partial<UsageQuotaApiEnv> = {}): UsageQuotaApiEnv {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_LANDMARK_LIMIT: '1',
    ECHO_FREE_PHOTO_LIMIT: '2',
    ECHO_FREE_STORAGE_BYTES: '100',
    ...overrides,
  };
}

test('usage quota API consumes authenticated usage and blocks over-limit requests', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-usage-api-'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'user_api' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const env = testEnv(dir);
    const first = await handleUsageQuotaRequest(
      { authorization: 'Bearer token' },
      { action: 'consume', landmarkCountDelta: 1, photoCountDelta: 1, storageBytesDelta: 50 },
      env
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.allowed, true);

    const blocked = await handleUsageQuotaRequest(
      { authorization: 'Bearer token' },
      { action: 'consume', landmarkCountDelta: 1, photoCountDelta: 0, storageBytesDelta: 0 },
      env
    );
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage quota API requires login when quota is enabled', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-usage-api-'));
  try {
    const result = await handleUsageQuotaRequest(
      {},
      { action: 'consume', landmarkCountDelta: 1, photoCountDelta: 1, storageBytesDelta: 10 },
      testEnv(dir)
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'AUTH_REQUIRED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage quota API ignores unsupported usage deltas', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-usage-api-'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'user_api_call_quota' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const env = testEnv(dir);
    const first = await handleUsageQuotaRequest(
      { authorization: 'Bearer token' },
      { action: 'consume', unsupportedDelta: 1 },
      env
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.allowed, true);

    const second = await handleUsageQuotaRequest(
      { authorization: 'Bearer token' },
      { action: 'consume', unsupportedDelta: 1 },
      env
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.allowed, true);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

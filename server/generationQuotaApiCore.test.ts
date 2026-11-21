import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleGenerationQuotaRequest, type GenerationQuotaApiEnv } from './generationQuotaApiCore.js';

function testEnv(dir: string, overrides: Partial<GenerationQuotaApiEnv> = {}): GenerationQuotaApiEnv {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_STARTER_GENERATIONS: '8',
    ECHO_FREE_MONTHLY_GENERATIONS: '2',
    ...overrides,
  };
}

test('generation quota response includes the current plan and total remaining balance', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-generation-quota-'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'user_quota_balance' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const result = await handleGenerationQuotaRequest(
      { authorization: 'Bearer token' },
      testEnv(dir),
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.balance, {
      currentPlan: 'free',
      quotaPlan: 'free',
      remainingGenerations: 10,
    });
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an exhausted account still receives a zero balance snapshot', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-generation-quota-empty-'));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'user_quota_empty' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const result = await handleGenerationQuotaRequest(
      { authorization: 'Bearer token' },
      testEnv(dir, {
        ECHO_FREE_STARTER_GENERATIONS: '0',
        ECHO_FREE_MONTHLY_GENERATIONS: '0',
      }),
    );

    assert.equal(result.status, 402);
    assert.deepEqual(result.body.balance, {
      currentPlan: 'free',
      quotaPlan: 'free',
      remainingGenerations: 0,
    });
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

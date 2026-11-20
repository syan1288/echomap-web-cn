import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  consumeGenerationEntitlement,
  consumeUsageEntitlement,
  createEntitlementStore,
  grantExtraCredits,
  getGenerationEntitlement,
  getUsageEntitlement,
  releaseUsageEntitlement,
  SupabaseEntitlementStore,
  type EntitlementStoreAdapter,
  type EntitlementEnv,
  type UserEntitlementRecord,
} from './entitlements.js';

function testEnv(dir: string, overrides: Partial<EntitlementEnv> = {}): EntitlementEnv {
  return {
    ECHO_ENTITLEMENTS_STORE_PATH: path.join(dir, 'entitlements.json'),
    ECHO_FREE_STARTER_GENERATIONS: '2',
    ECHO_FREE_MONTHLY_GENERATIONS: '1',
    ...overrides,
  };
}

test('free users consume starter quota before monthly quota', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const env = testEnv(dir);

    assert.deepEqual(await getGenerationEntitlement('user_a', env), {
      allowed: true,
      plan: 'free',
      periodKey: 'starter',
      limit: 2,
      used: 0,
      remaining: 2,
    });

    assert.equal((await consumeGenerationEntitlement('user_a', env)).allowed, true);
    const second = await consumeGenerationEntitlement('user_a', env);
    assert.equal(second.allowed, true);
    assert.equal(second.periodKey, 'starter');
    assert.equal(second.remaining, 0);

    const monthly = await consumeGenerationEntitlement('user_a', env);
    assert.equal(monthly.allowed, true);
    assert.match(monthly.periodKey, /^\d{4}-\d{2}$/);
    assert.equal(monthly.limit, 1);
    assert.equal(monthly.used, 1);
    assert.equal(monthly.remaining, 0);

    const blocked = await consumeGenerationEntitlement('user_a', env);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'quota_exhausted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('extra credits are consumed after free monthly quota is exhausted', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const env = testEnv(dir, {
      ECHO_FREE_STARTER_GENERATIONS: '0',
      ECHO_FREE_MONTHLY_GENERATIONS: '0',
      ECHO_INITIAL_EXTRA_CREDITS: '1',
    });

    const first = await consumeGenerationEntitlement('user_b', env);
    assert.equal(first.allowed, true);
    assert.equal(first.periodKey, 'extra');
    assert.equal(first.remaining, 0);

    const blocked = await consumeGenerationEntitlement('user_b', env);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'quota_exhausted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('grantExtraCredits adds credits without resetting existing usage', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const env = testEnv(dir, {
      ECHO_FREE_STARTER_GENERATIONS: '0',
      ECHO_FREE_MONTHLY_GENERATIONS: '0',
    });

    const granted = await grantExtraCredits('user_grant', 20, env);
    assert.equal(granted.extraCredits, 20);
    assert.equal(granted.plan, 'free');

    const first = await consumeGenerationEntitlement('user_grant', env);
    assert.equal(first.allowed, true);
    assert.equal(first.periodKey, 'extra');
    assert.equal(first.remaining, 19);

    const secondGrant = await grantExtraCredits('user_grant', 5, env);
    assert.equal(secondGrant.extraCredits, 24);
    assert.equal(secondGrant.lifetimeSuccessfulGenerations, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('grantExtraCredits rejects non-positive grants', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    await assert.rejects(
      () => grantExtraCredits('user_grant_invalid', 0, testEnv(dir)),
      /positive integer/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('free usage quota defaults to 20 landmarks and 500 photos', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const env = testEnv(dir);

    const allowed = await getUsageEntitlement(
      'user_usage_defaults',
      { landmarkCountDelta: 20, photoCountDelta: 500, storageBytesDelta: 0 },
      env
    );
    assert.equal(allowed.allowed, true);

    const blockedByLandmarks = await getUsageEntitlement(
      'user_usage_defaults',
      { landmarkCountDelta: 21, photoCountDelta: 500, storageBytesDelta: 0 },
      env
    );
    assert.equal(blockedByLandmarks.allowed, false);
    assert.deepEqual(blockedByLandmarks.exhausted.map((q) => q.kind), ['landmark_count']);

    const blockedByPhotos = await getUsageEntitlement(
      'user_usage_defaults',
      { landmarkCountDelta: 20, photoCountDelta: 501, storageBytesDelta: 0 },
      env
    );
    assert.equal(blockedByPhotos.allowed, false);
    assert.deepEqual(blockedByPhotos.exhausted.map((q) => q.kind), ['photo_count']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage quotas consume storage and release deleted usage', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const env = testEnv(dir, {
      ECHO_FREE_LANDMARK_LIMIT: '2',
      ECHO_FREE_PHOTO_LIMIT: '3',
      ECHO_FREE_STORAGE_BYTES: '100',
    });

    const first = await consumeUsageEntitlement(
      'user_usage',
      { landmarkCountDelta: 1, photoCountDelta: 2, storageBytesDelta: 60 },
      env
    );
    assert.equal(first.allowed, true);
    assert.equal(first.usage.landmarkCount, 1);
    assert.equal(first.usage.photoCount, 2);
    assert.equal(first.usage.storageBytesUsed, 60);

    const blocked = await consumeUsageEntitlement(
      'user_usage',
      { landmarkCountDelta: 1, photoCountDelta: 2, storageBytesDelta: 30 },
      env
    );
    assert.equal(blocked.allowed, false);
    assert.deepEqual(blocked.exhausted.map((q) => q.kind), ['photo_count']);

    const afterBlocked = await getUsageEntitlement(
      'user_usage',
      { landmarkCountDelta: 0, photoCountDelta: 0, storageBytesDelta: 0 },
      env
    );
    assert.equal(afterBlocked.allowed, true);
    assert.equal(afterBlocked.usage.photoCount, 2);

    const released = await releaseUsageEntitlement(
      'user_usage',
      { landmarkCountDelta: 1, photoCountDelta: 1, storageBytesDelta: 25 },
      env
    );
    assert.equal(released.usage.landmarkCount, 0);
    assert.equal(released.usage.photoCount, 1);
    assert.equal(released.usage.storageBytesUsed, 35);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage quotas expose only saved-resource quota kinds', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'echo-entitlements-'));
  try {
    const result = await getUsageEntitlement('user_usage_kinds', {}, testEnv(dir));

    assert.deepEqual(result.quotas.map((quota) => quota.kind), [
      'landmark_count',
      'photo_count',
      'storage_bytes_used',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('entitlements can read and write through an injected store adapter', async () => {
  const writes: string[] = [];
  const users: Record<string, UserEntitlementRecord> = {};
  const store: EntitlementStoreAdapter = {
    async readUser(userId: string) {
      return users[userId];
    },
    async writeUser(userId: string, record: UserEntitlementRecord) {
      users[userId] = record;
      writes.push(userId);
    },
  };

  const result = await consumeUsageEntitlement(
    'adapter_user',
    { landmarkCountDelta: 1 },
    testEnv('', { ECHO_FREE_LANDMARK_LIMIT: '1' }),
    new Date('2026-05-17T00:00:00Z'),
    store
  );

  assert.equal(result.allowed, true);
  assert.equal(result.usage.landmarkCount, 1);
  assert.deepEqual(writes, ['adapter_user']);
});

test('Supabase entitlement store accepts the current secret key env name', () => {
  const env = {
    ECHO_ENTITLEMENTS_STORE: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  } as EntitlementEnv;

  assert.ok(createEntitlementStore(env) instanceof SupabaseEntitlementStore);
});

test('Supabase generation consumption uses one atomic database operation with configured limits', async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const env = testEnv('', {
    ECHO_FREE_STARTER_GENERATIONS: '3',
    ECHO_FREE_MONTHLY_GENERATIONS: '4',
    ECHO_PLUS_MONTHLY_GENERATIONS: '25',
    ECHO_PRO_MONTHLY_GENERATIONS: '80',
  });
  const expected = {
    allowed: true,
    plan: 'free',
    periodKey: 'extra',
    limit: 20,
    used: 1,
    remaining: 19,
  } as const;
  const store = {
    async readUser() {
      throw new Error('atomic generation operation was bypassed');
    },
    async writeUser() {
      throw new Error('atomic generation operation was bypassed');
    },
    async consumeGeneration(userId: string, options: EntitlementEnv, now: Date) {
      calls.push({
        name: userId,
        args: {
          ECHO_FREE_STARTER_GENERATIONS: options.ECHO_FREE_STARTER_GENERATIONS,
          ECHO_FREE_MONTHLY_GENERATIONS: options.ECHO_FREE_MONTHLY_GENERATIONS,
          ECHO_PLUS_MONTHLY_GENERATIONS: options.ECHO_PLUS_MONTHLY_GENERATIONS,
          ECHO_PRO_MONTHLY_GENERATIONS: options.ECHO_PRO_MONTHLY_GENERATIONS,
          now: now.toISOString(),
        },
      });
      return expected;
    },
  } as EntitlementStoreAdapter & {
    consumeGeneration(
      userId: string,
      env: EntitlementEnv,
      now: Date
    ): Promise<typeof expected>;
  };

  const result = await consumeGenerationEntitlement(
    '00000000-0000-4000-8000-000000000001',
    env,
    new Date('2026-11-19T00:00:00.000Z'),
    store
  );

  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [
    {
      name: '00000000-0000-4000-8000-000000000001',
      args: {
        ECHO_FREE_STARTER_GENERATIONS: '3',
        ECHO_FREE_MONTHLY_GENERATIONS: '4',
        ECHO_PLUS_MONTHLY_GENERATIONS: '25',
        ECHO_PRO_MONTHLY_GENERATIONS: '80',
        now: '2026-11-19T00:00:00.000Z',
      },
    },
  ]);
});

test('Supabase entitlement store records consumption and grants through database RPCs', async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      if (name === 'consume_generation_entitlement') {
        return {
          data: {
            allowed: true,
            plan: 'free',
            periodKey: '2026-11',
            limit: 2,
            used: 1,
            remaining: 1,
          },
          error: null,
        };
      }
      return {
        data: {
          user_id: '00000000-0000-4000-8000-000000000001',
          plan: 'free',
          period_key: '2026-11',
          generation_used: 0,
          starter_generation_used: 0,
          extra_credits: 7,
          landmark_count: 0,
          photo_count: 0,
          storage_bytes_used: 0,
          generation_unlimited: true,
          created_at: '2026-11-19T00:00:00.000Z',
          updated_at: '2026-11-19T00:00:00.000Z',
        },
        error: null,
      };
    },
  };
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  } as EntitlementEnv;
  const store = new SupabaseEntitlementStore(env, client as never);

  const consumed = await store.consumeGeneration(
    '00000000-0000-4000-8000-000000000001',
    testEnv('', {
      ECHO_FREE_STARTER_GENERATIONS: '3',
      ECHO_FREE_MONTHLY_GENERATIONS: '4',
      ECHO_PLUS_MONTHLY_GENERATIONS: '25',
      ECHO_PRO_MONTHLY_GENERATIONS: '80',
    }),
    new Date('2026-11-19T00:00:00.000Z')
  );
  const granted = await grantExtraCredits(
    '00000000-0000-4000-8000-000000000001',
    7,
    env,
    new Date('2026-11-19T00:00:00.000Z'),
    store
  );

  assert.equal(consumed.allowed, true);
  assert.equal(granted.extraCredits, 7);
  assert.equal(granted.generationUnlimited, true);
  assert.deepEqual(calls, [
    {
      name: 'consume_generation_entitlement',
      args: {
        p_user_id: '00000000-0000-4000-8000-000000000001',
        p_free_starter_limit: 3,
        p_free_monthly_limit: 4,
        p_plus_monthly_limit: 25,
        p_pro_monthly_limit: 80,
        p_now: '2026-11-19T00:00:00.000Z',
      },
    },
    {
      name: 'grant_extra_credits',
      args: {
        p_user_id: '00000000-0000-4000-8000-000000000001',
        p_credits: 7,
        p_granted_at: '2026-11-19T00:00:00.000Z',
      },
    },
  ]);
});

test('atomic Supabase quota operations reject a custom entitlement table', async () => {
  const store = new SupabaseEntitlementStore({
    ECHO_ENTITLEMENTS_TABLE: 'custom_entitlements',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  } as EntitlementEnv, {
    async rpc() {
      throw new Error('unexpected RPC for unsupported table');
    },
  } as never);

  await assert.rejects(
    () => store.consumeGeneration('00000000-0000-4000-8000-000000000001', testEnv('')),
    /require ECHO_ENTITLEMENTS_TABLE=echo_entitlements/
  );
});

test('Supabase usage writes do not overwrite payment credits or generation counters', async () => {
  let upserted: unknown;
  const client = {
    from() {
      return {
        upsert(value: unknown) {
          upserted = value;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const store = new SupabaseEntitlementStore({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
  } as EntitlementEnv, client as never);
  const record: UserEntitlementRecord = {
    plan: 'free',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
    lifetimeSuccessfulGenerations: 5,
    monthlyPeriodKey: '2026-11',
    monthlyGenerationUsed: 9,
    extraCredits: 40,
    generationUnlimited: true,
    landmarkCount: 2,
    photoCount: 3,
    storageBytesUsed: 50,
  };

  await store.writeUser('00000000-0000-4000-8000-000000000001', record);

  assert.deepEqual(upserted, {
    user_id: '00000000-0000-4000-8000-000000000001',
    landmark_count: 2,
    photo_count: 3,
    storage_bytes_used: 50,
    generation_unlimited: true,
    updated_at: '2026-11-19T00:00:00.000Z',
  });
});

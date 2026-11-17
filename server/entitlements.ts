import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MAX_UPLOAD_BYTES } from '../shared/domain/uploads/uploadLimits.js';

export type GenerationPlan = 'free' | 'plus' | 'pro';
export type UsageQuotaKind = 'landmark_count' | 'photo_count' | 'storage_bytes_used';

export type EntitlementEnv = {
  ECHO_ENTITLEMENTS_STORE?: string;
  ECHO_ENTITLEMENTS_STORE_PATH?: string;
  ECHO_ENTITLEMENTS_TABLE?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ECHO_FREE_STARTER_GENERATIONS?: string;
  ECHO_FREE_MONTHLY_GENERATIONS?: string;
  ECHO_PLUS_MONTHLY_GENERATIONS?: string;
  ECHO_PRO_MONTHLY_GENERATIONS?: string;
  ECHO_INITIAL_EXTRA_CREDITS?: string;
  ECHO_FREE_LANDMARK_LIMIT?: string;
  ECHO_FREE_PHOTO_LIMIT?: string;
  ECHO_FREE_STORAGE_BYTES?: string;
  ECHO_PLUS_LANDMARK_LIMIT?: string;
  ECHO_PLUS_PHOTO_LIMIT?: string;
  ECHO_PLUS_STORAGE_BYTES?: string;
  ECHO_PRO_LANDMARK_LIMIT?: string;
  ECHO_PRO_PHOTO_LIMIT?: string;
  ECHO_PRO_STORAGE_BYTES?: string;
};

export type GenerationEntitlement =
  | {
      allowed: true;
      plan: GenerationPlan;
      periodKey: string;
      limit: number;
      used: number;
      remaining: number;
    }
  | {
      allowed: false;
      plan: GenerationPlan;
      periodKey: string;
      limit: number;
      used: number;
      remaining: 0;
      reason: 'quota_exhausted';
    };

export type UsageQuotaDelta = {
  landmarkCountDelta?: number;
  photoCountDelta?: number;
  storageBytesDelta?: number;
};

type UsageQuotaSnapshot = {
  kind: UsageQuotaKind;
  limit: number;
  used: number;
  remaining: number;
};

type UsageSnapshot = {
  landmarkCount: number;
  photoCount: number;
  storageBytesUsed: number;
};

export type UsageEntitlement =
  | {
      allowed: true;
      plan: GenerationPlan;
      usage: UsageSnapshot;
      quotas: UsageQuotaSnapshot[];
    }
  | {
      allowed: false;
      plan: GenerationPlan;
      usage: UsageSnapshot;
      quotas: UsageQuotaSnapshot[];
      exhausted: UsageQuotaSnapshot[];
      reason: 'quota_exhausted';
    };

export type UserEntitlementRecord = {
  plan: GenerationPlan;
  createdAt: string;
  updatedAt: string;
  lifetimeSuccessfulGenerations: number;
  monthlyPeriodKey: string;
  monthlyGenerationUsed: number;
  extraCredits: number;
  landmarkCount: number;
  photoCount: number;
  storageBytesUsed: number;
};

type EntitlementStoreData = {
  users: Record<string, UserEntitlementRecord>;
};

export type EntitlementStoreAdapter = {
  readUser(userId: string): Promise<UserEntitlementRecord | undefined>;
  writeUser(userId: string, record: UserEntitlementRecord): Promise<void>;
};

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeUsageNumber(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 0;
  return Math.max(0, Math.trunc(Number.isFinite(numericValue) ? numericValue : 0));
}

function entitlementStorePath(env: EntitlementEnv): string {
  const explicit = env.ECHO_ENTITLEMENTS_STORE_PATH?.trim();
  return explicit || path.join(process.cwd(), 'logs', 'entitlements.json');
}

function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function emptyStore(): EntitlementStoreData {
  return { users: {} };
}

export class FileEntitlementStore implements EntitlementStoreAdapter {
  constructor(private readonly env: EntitlementEnv = process.env) {}

  async readUser(userId: string): Promise<UserEntitlementRecord | undefined> {
    return this.readStore().users[userId];
  }

  async writeUser(userId: string, record: UserEntitlementRecord): Promise<void> {
    const store = this.readStore();
    store.users[userId] = record;
    this.writeStore(store);
  }

  private readStore(): EntitlementStoreData {
    const filePath = entitlementStorePath(this.env);
    if (!existsSync(filePath)) return emptyStore();
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<EntitlementStoreData>;
      return { users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {} };
    } catch {
      return emptyStore();
    }
  }

  private writeStore(store: EntitlementStoreData): void {
    const filePath = entitlementStorePath(this.env);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    renameSync(tmpPath, filePath);
  }
}

type SupabaseEntitlementRow = Record<string, unknown>;

function rowString(row: SupabaseEntitlementRow, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function rowNumber(row: SupabaseEntitlementRow, key: string, fallback = 0): number {
  return normalizeUsageNumber(row[key] ?? fallback);
}

function recordFromSupabaseRow(row: SupabaseEntitlementRow): UserEntitlementRecord {
  const now = new Date().toISOString();
  const rawPlan = rowString(row, 'plan');
  const plan: GenerationPlan = rawPlan === 'plus' || rawPlan === 'pro' ? rawPlan : 'free';
  return {
    plan,
    createdAt: rowString(row, 'created_at', now),
    updatedAt: rowString(row, 'updated_at', now),
    lifetimeSuccessfulGenerations: rowNumber(row, 'starter_generation_used', rowNumber(row, 'lifetime_generation_used', 0)),
    monthlyPeriodKey: rowString(row, 'period_key', currentMonthKey()),
    monthlyGenerationUsed: rowNumber(row, 'generation_used', rowNumber(row, 'monthly_generation_used', 0)),
    extraCredits: rowNumber(row, 'extra_credits', 0),
    landmarkCount: rowNumber(row, 'landmark_count', 0),
    photoCount: rowNumber(row, 'photo_count', 0),
    storageBytesUsed: rowNumber(row, 'storage_bytes_used', 0),
  };
}

function recordToSupabaseRow(userId: string, record: UserEntitlementRecord): SupabaseEntitlementRow {
  return {
    user_id: userId,
    plan: record.plan,
    period_key: record.monthlyPeriodKey,
    generation_used: record.monthlyGenerationUsed,
    starter_generation_used: record.lifetimeSuccessfulGenerations,
    landmark_count: record.landmarkCount,
    photo_count: record.photoCount,
    storage_bytes_used: record.storageBytesUsed,
    extra_credits: record.extraCredits,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SupabaseEntitlementStore implements EntitlementStoreAdapter {
  private readonly client: SupabaseClient;
  private readonly tableName: string;

  constructor(env: EntitlementEnv = process.env) {
    const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) {
      throw new Error('Supabase entitlement store requires SUPABASE_URL and a server-side Supabase key');
    }
    this.client = createClient(url, key, { auth: { persistSession: false } });
    this.tableName = env.ECHO_ENTITLEMENTS_TABLE?.trim() || 'echo_entitlements';
  }

  async readUser(userId: string): Promise<UserEntitlementRecord | undefined> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? recordFromSupabaseRow(data as SupabaseEntitlementRow) : undefined;
  }

  async writeUser(userId: string, record: UserEntitlementRecord): Promise<void> {
    const { error } = await this.client
      .from(this.tableName)
      .upsert(recordToSupabaseRow(userId, record), { onConflict: 'user_id' });
    if (error) throw error;
  }
}

export function createEntitlementStore(env: EntitlementEnv = process.env): EntitlementStoreAdapter {
  const kind = env.ECHO_ENTITLEMENTS_STORE?.trim().toLowerCase();
  if (kind === 'supabase') return new SupabaseEntitlementStore(env);
  return new FileEntitlementStore(env);
}

function normalizeRecord(
  record: UserEntitlementRecord | undefined,
  env: EntitlementEnv,
  now = new Date()
): UserEntitlementRecord {
  const periodKey = currentMonthKey(now);
  const createdAt = now.toISOString();
  const next: UserEntitlementRecord = {
    plan: record?.plan === 'plus' || record?.plan === 'pro' ? record.plan : 'free',
    createdAt: record?.createdAt || createdAt,
    updatedAt: createdAt,
    lifetimeSuccessfulGenerations: Math.max(0, Math.trunc(record?.lifetimeSuccessfulGenerations ?? 0)),
    monthlyPeriodKey: record?.monthlyPeriodKey || periodKey,
    monthlyGenerationUsed: Math.max(0, Math.trunc(record?.monthlyGenerationUsed ?? 0)),
    extraCredits: Math.max(
      0,
      Math.trunc(record?.extraCredits ?? intFromEnv(env.ECHO_INITIAL_EXTRA_CREDITS, 0))
    ),
    landmarkCount: normalizeUsageNumber(record?.landmarkCount),
    photoCount: normalizeUsageNumber(record?.photoCount),
    storageBytesUsed: normalizeUsageNumber(record?.storageBytesUsed),
  };

  if (next.monthlyPeriodKey !== periodKey) {
    next.monthlyPeriodKey = periodKey;
    next.monthlyGenerationUsed = 0;
  }

  return next;
}

function monthlyLimitForPlan(plan: GenerationPlan, env: EntitlementEnv): number {
  if (plan === 'plus') return intFromEnv(env.ECHO_PLUS_MONTHLY_GENERATIONS, 20);
  if (plan === 'pro') return intFromEnv(env.ECHO_PRO_MONTHLY_GENERATIONS, 60);
  return intFromEnv(env.ECHO_FREE_MONTHLY_GENERATIONS, 2);
}

function landmarkLimitForPlan(plan: GenerationPlan, env: EntitlementEnv): number {
  if (plan === 'plus') return intFromEnv(env.ECHO_PLUS_LANDMARK_LIMIT, 100);
  if (plan === 'pro') return intFromEnv(env.ECHO_PRO_LANDMARK_LIMIT, 500);
  return intFromEnv(env.ECHO_FREE_LANDMARK_LIMIT, 20);
}

function photoLimitForPlan(plan: GenerationPlan, env: EntitlementEnv): number {
  if (plan === 'plus') return intFromEnv(env.ECHO_PLUS_PHOTO_LIMIT, 1000);
  if (plan === 'pro') return intFromEnv(env.ECHO_PRO_PHOTO_LIMIT, 3000);
  return intFromEnv(env.ECHO_FREE_PHOTO_LIMIT, 500);
}

function storageLimitForPlan(plan: GenerationPlan, env: EntitlementEnv): number {
  if (plan === 'plus') return numberFromEnv(env.ECHO_PLUS_STORAGE_BYTES, photoLimitForPlan(plan, env) * MAX_UPLOAD_BYTES);
  if (plan === 'pro') return numberFromEnv(env.ECHO_PRO_STORAGE_BYTES, photoLimitForPlan(plan, env) * MAX_UPLOAD_BYTES);
  return numberFromEnv(env.ECHO_FREE_STORAGE_BYTES, photoLimitForPlan(plan, env) * MAX_UPLOAD_BYTES);
}

function normalizeDelta(delta: UsageQuotaDelta): Required<UsageQuotaDelta> {
  return {
    landmarkCountDelta: normalizeUsageNumber(delta.landmarkCountDelta),
    photoCountDelta: normalizeUsageNumber(delta.photoCountDelta),
    storageBytesDelta: normalizeUsageNumber(delta.storageBytesDelta),
  };
}

function usageSnapshot(record: UserEntitlementRecord): UsageSnapshot {
  return {
    landmarkCount: record.landmarkCount,
    photoCount: record.photoCount,
    storageBytesUsed: record.storageBytesUsed,
  };
}

function buildUsageQuotas(record: UserEntitlementRecord, env: EntitlementEnv): UsageQuotaSnapshot[] {
  const landmarkLimit = landmarkLimitForPlan(record.plan, env);
  const photoLimit = photoLimitForPlan(record.plan, env);
  const storageLimit = storageLimitForPlan(record.plan, env);
  return [
    {
      kind: 'landmark_count',
      limit: landmarkLimit,
      used: record.landmarkCount,
      remaining: Math.max(0, landmarkLimit - record.landmarkCount),
    },
    {
      kind: 'photo_count',
      limit: photoLimit,
      used: record.photoCount,
      remaining: Math.max(0, photoLimit - record.photoCount),
    },
    {
      kind: 'storage_bytes_used',
      limit: storageLimit,
      used: record.storageBytesUsed,
      remaining: Math.max(0, storageLimit - record.storageBytesUsed),
    },
  ];
}

function evaluateUsageRecord(
  record: UserEntitlementRecord,
  delta: UsageQuotaDelta,
  env: EntitlementEnv
): UsageEntitlement {
  const normalizedDelta = normalizeDelta(delta);
  const quotas = buildUsageQuotas(record, env);
  const projected = new Map<UsageQuotaKind, number>([
    ['landmark_count', record.landmarkCount + normalizedDelta.landmarkCountDelta],
    ['photo_count', record.photoCount + normalizedDelta.photoCountDelta],
    ['storage_bytes_used', record.storageBytesUsed + normalizedDelta.storageBytesDelta],
  ]);
  const exhausted = quotas.filter((quota) => (projected.get(quota.kind) ?? quota.used) > quota.limit);

  if (exhausted.length) {
    return {
      allowed: false,
      plan: record.plan,
      usage: usageSnapshot(record),
      quotas,
      exhausted,
      reason: 'quota_exhausted',
    };
  }

  return {
    allowed: true,
    plan: record.plan,
    usage: usageSnapshot(record),
    quotas,
  };
}

function evaluateRecord(record: UserEntitlementRecord, env: EntitlementEnv): GenerationEntitlement {
  const starterLimit = record.plan === 'free' ? intFromEnv(env.ECHO_FREE_STARTER_GENERATIONS, 8) : 0;
  if (record.lifetimeSuccessfulGenerations < starterLimit) {
    return {
      allowed: true,
      plan: record.plan,
      periodKey: 'starter',
      limit: starterLimit,
      used: record.lifetimeSuccessfulGenerations,
      remaining: starterLimit - record.lifetimeSuccessfulGenerations,
    };
  }

  const monthlyLimit = monthlyLimitForPlan(record.plan, env);
  if (record.monthlyGenerationUsed < monthlyLimit) {
    return {
      allowed: true,
      plan: record.plan,
      periodKey: record.monthlyPeriodKey,
      limit: monthlyLimit,
      used: record.monthlyGenerationUsed,
      remaining: monthlyLimit - record.monthlyGenerationUsed,
    };
  }

  if (record.extraCredits > 0) {
    return {
      allowed: true,
      plan: record.plan,
      periodKey: 'extra',
      limit: record.extraCredits,
      used: 0,
      remaining: record.extraCredits,
    };
  }

  return {
    allowed: false,
    plan: record.plan,
    periodKey: record.monthlyPeriodKey,
    limit: monthlyLimit,
    used: record.monthlyGenerationUsed,
    remaining: 0,
    reason: 'quota_exhausted',
  };
}

export async function getGenerationEntitlement(
  userId: string,
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<GenerationEntitlement> {
  const record = normalizeRecord(await store.readUser(userId), env, now);
  return evaluateRecord(record, env);
}

export async function consumeGenerationEntitlement(
  userId: string,
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<GenerationEntitlement> {
  const record = normalizeRecord(await store.readUser(userId), env, now);
  const before = evaluateRecord(record, env);
  if (!before.allowed) {
    await store.writeUser(userId, record);
    return before;
  }

  if (before.periodKey === 'starter') {
    record.lifetimeSuccessfulGenerations += 1;
  } else if (before.periodKey === 'extra') {
    record.extraCredits = Math.max(0, record.extraCredits - 1);
  } else {
    record.monthlyGenerationUsed += 1;
  }

  record.updatedAt = now.toISOString();
  await store.writeUser(userId, record);
  return {
    ...before,
    used: before.used + 1,
    remaining: Math.max(0, before.remaining - 1),
  };
}

export async function grantExtraCredits(
  userId: string,
  credits: number,
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<UserEntitlementRecord> {
  const normalizedCredits = Math.trunc(credits);
  if (!userId.trim()) throw new Error('userId is required');
  if (!Number.isFinite(normalizedCredits) || normalizedCredits <= 0) {
    throw new Error('credits must be a positive integer');
  }

  const record = normalizeRecord(await store.readUser(userId), env, now);
  record.extraCredits += normalizedCredits;
  record.updatedAt = now.toISOString();
  await store.writeUser(userId, record);
  return record;
}

export async function getUsageEntitlement(
  userId: string,
  delta: UsageQuotaDelta = {},
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<UsageEntitlement> {
  const record = normalizeRecord(await store.readUser(userId), env, now);
  return evaluateUsageRecord(record, delta, env);
}

export async function consumeUsageEntitlement(
  userId: string,
  delta: UsageQuotaDelta,
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<UsageEntitlement> {
  const record = normalizeRecord(await store.readUser(userId), env, now);
  const before = evaluateUsageRecord(record, delta, env);
  if (!before.allowed) {
    await store.writeUser(userId, record);
    return before;
  }

  const normalizedDelta = normalizeDelta(delta);
  record.landmarkCount += normalizedDelta.landmarkCountDelta;
  record.photoCount += normalizedDelta.photoCountDelta;
  record.storageBytesUsed += normalizedDelta.storageBytesDelta;
  record.updatedAt = now.toISOString();
  await store.writeUser(userId, record);
  return evaluateUsageRecord(record, {}, env);
}

export async function releaseUsageEntitlement(
  userId: string,
  delta: UsageQuotaDelta,
  env: EntitlementEnv = process.env,
  now = new Date(),
  store: EntitlementStoreAdapter = createEntitlementStore(env)
): Promise<Extract<UsageEntitlement, { allowed: true }>> {
  const record = normalizeRecord(await store.readUser(userId), env, now);
  const normalizedDelta = normalizeDelta(delta);
  record.landmarkCount = Math.max(0, record.landmarkCount - normalizedDelta.landmarkCountDelta);
  record.photoCount = Math.max(0, record.photoCount - normalizedDelta.photoCountDelta);
  record.storageBytesUsed = Math.max(0, record.storageBytesUsed - normalizedDelta.storageBytesDelta);
  record.updatedAt = now.toISOString();
  await store.writeUser(userId, record);
  return evaluateUsageRecord(record, {}, env) as Extract<UsageEntitlement, { allowed: true }>;
}

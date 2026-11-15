import { getAuthenticatedUser, type AuthEnv, type HeaderLike } from './authUser.js';
import {
  consumeUsageEntitlement,
  getUsageEntitlement,
  releaseUsageEntitlement,
  type EntitlementEnv,
  type UsageQuotaDelta,
} from './entitlements.js';

export type UsageQuotaApiEnv = AuthEnv &
  EntitlementEnv & {
    ECHO_USAGE_QUOTA_ENABLED?: string;
  };

export type UsageQuotaApiResult = {
  status: number;
  body: Record<string, unknown>;
};

type UsageQuotaAction = 'check' | 'consume' | 'release';

function isUsageQuotaEnabled(env: UsageQuotaApiEnv): boolean {
  const raw = env.ECHO_USAGE_QUOTA_ENABLED?.trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

function parseAction(value: unknown): UsageQuotaAction | null {
  if (value === 'check' || value === 'consume' || value === 'release') return value;
  return null;
}

function parseDeltaNumber(value: unknown): number | null {
  if (value == null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

function parseDelta(body: Record<string, unknown>): UsageQuotaDelta | null {
  const landmarkCountDelta = parseDeltaNumber(body.landmarkCountDelta);
  const photoCountDelta = parseDeltaNumber(body.photoCountDelta);
  const storageBytesDelta = parseDeltaNumber(body.storageBytesDelta);
  if (landmarkCountDelta == null || photoCountDelta == null || storageBytesDelta == null) return null;
  return { landmarkCountDelta, photoCountDelta, storageBytesDelta };
}

export async function handleUsageQuotaRequest(
  headers: HeaderLike,
  body: Record<string, unknown>,
  env: UsageQuotaApiEnv = process.env
): Promise<UsageQuotaApiResult> {
  if (!isUsageQuotaEnabled(env)) {
    return {
      status: 200,
      body: { allowed: true, quotaDisabled: true },
    };
  }

  const auth = await getAuthenticatedUser(headers, env);
  if (auth.ok === false) {
    return {
      status: auth.status,
      body: {
        error: auth.status === 401 ? 'Login required before saving memories.' : auth.error,
        code: auth.status === 401 ? 'AUTH_REQUIRED' : 'AUTH_CONFIG_MISSING',
      },
    };
  }

  const action = parseAction(body.action);
  if (!action) {
    return { status: 400, body: { error: 'action must be check, consume, or release' } };
  }

  const delta = parseDelta(body);
  if (!delta) {
    return {
      status: 400,
      body: { error: 'usage deltas must be non-negative finite numbers' },
    };
  }

  if (action === 'release') {
    const entitlement = await releaseUsageEntitlement(auth.userId, delta, env);
    return { status: 200, body: entitlement };
  }

  const entitlement =
    action === 'consume'
      ? await consumeUsageEntitlement(auth.userId, delta, env)
      : await getUsageEntitlement(auth.userId, delta, env);

  return {
    status: entitlement.allowed ? 200 : 402,
    body: entitlement,
  };
}

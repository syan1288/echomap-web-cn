import { getAuthenticatedUser, type AuthEnv, type HeaderLike } from './authUser.js';
import {
  getGenerationBalance,
  getGenerationEntitlement,
  type EntitlementEnv,
} from './entitlements.js';

export type GenerationQuotaApiEnv = AuthEnv &
  EntitlementEnv & {
    ECHO_GENERATION_QUOTA_ENABLED?: string;
  };

export type GenerationQuotaApiResult = {
  status: number;
  body: Record<string, unknown>;
};

function isGenerationQuotaEnabled(env: GenerationQuotaApiEnv): boolean {
  const raw = env.ECHO_GENERATION_QUOTA_ENABLED?.trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

export async function handleGenerationQuotaRequest(
  headers: HeaderLike,
  env: GenerationQuotaApiEnv = process.env
): Promise<GenerationQuotaApiResult> {
  if (!isGenerationQuotaEnabled(env)) {
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
        error: auth.status === 401 ? 'Login required before generating images.' : auth.error,
        code: auth.status === 401 ? 'AUTH_REQUIRED' : 'AUTH_CONFIG_MISSING',
      },
    };
  }

  const [entitlement, balance] = await Promise.all([
    getGenerationEntitlement(auth.userId, env),
    getGenerationBalance(auth.userId, env),
  ]);
  return {
    status: entitlement.allowed ? 200 : 402,
    body: entitlement.allowed
      ? { ...entitlement, balance }
      : {
          error: 'Free generation quota used up. Upgrade or wait until next month.',
          code: 'GENERATION_QUOTA_EXHAUSTED',
          entitlement,
          balance,
        },
  };
}

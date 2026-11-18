export type HeaderLike = Record<string, string | string[] | undefined>;

export type AuthUser =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503; error: string };

export type AuthEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

export function getBearerToken(headers: HeaderLike): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const value of values) {
    const match = value.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function supabaseConfig(env: AuthEnv): { url: string; anonKey: string } | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export async function getAuthenticatedUser(
  headers: HeaderLike,
  env: AuthEnv = process.env
): Promise<AuthUser> {
  const token = getBearerToken(headers);
  if (!token) return { ok: false, status: 401, error: 'login required' };

  const config = supabaseConfig(env);
  if (!config) {
    return { ok: false, status: 503, error: 'Supabase auth is not configured on the server' };
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return { ok: false, status: 503, error: 'Unable to verify login session' };
  }

  if (!response.ok) return { ok: false, status: 401, error: 'invalid login session' };

  const data = (await response.json().catch(() => null)) as { id?: unknown } | null;
  if (!data || typeof data.id !== 'string' || !data.id) {
    return { ok: false, status: 401, error: 'invalid login session' };
  }

  return { ok: true, userId: data.id };
}

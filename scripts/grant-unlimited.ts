import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { grantGenerationUnlimited } from '../server/entitlements.js';

function usage(): never {
  console.error('Usage: npm run grant:unlimited -- <userId|email> [--off]');
  process.exit(1);
}

function loadLocalEnv(): Record<string, string> {
  if (!existsSync('.env')) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, '').trim();
    out[key] = value;
  }
  return out;
}

function envValue(key: string, localEnv: Record<string, string>): string {
  return (process.env[key] || localEnv[key] || '').trim();
}

async function resolveEmailToUserId(email: string, localEnv: Record<string, string>): Promise<string> {
  const url = envValue('SUPABASE_URL', localEnv) || envValue('VITE_SUPABASE_URL', localEnv);
  const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY', localEnv);
  if (!url || !serviceRoleKey) {
    throw new Error('Resolving email requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server');
  }

  const client = createClient(url.replace(/\/+$/, ''), serviceRoleKey, {
    auth: { persistSession: false },
  });
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  throw new Error(`No Supabase auth user found for ${email}`);
}

const [, , targetArg, ...flags] = process.argv;
const target = targetArg?.trim();
if (!target) usage();
const enabled = !flags.includes('--off');
const localEnv = loadLocalEnv();

try {
  const userId = target.includes('@') ? await resolveEmailToUserId(target, localEnv) : target;
  const env = { ...localEnv, ...process.env };
  const record = await grantGenerationUnlimited(userId, enabled, env);
  console.log(
    JSON.stringify(
      {
        ok: true,
        target,
        userId,
        generationUnlimited: record.generationUnlimited === true,
        plan: record.plan,
        updatedAt: record.updatedAt,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

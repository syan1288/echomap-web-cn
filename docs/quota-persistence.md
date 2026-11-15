# Quota Persistence

## Current Store Modes

`server/entitlements.ts` now uses an entitlement store adapter:

- `FileEntitlementStore`: default validation mode, backed by `logs/entitlements.json` or `ECHO_ENTITLEMENTS_STORE_PATH`.
- `SupabaseEntitlementStore`: production-oriented mode, enabled with `ECHO_ENTITLEMENTS_STORE=supabase`.

Keep `file` for a single Tencent Cloud Lighthouse process. Use `supabase` before running multiple API instances, serverless functions, or payment-driven plan changes.

## Supabase Table

Recommended table name: `echo_entitlements` unless overridden by `ECHO_ENTITLEMENTS_TABLE`.

```sql
create table if not exists public.echo_entitlements (
  user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  period_key text not null,
  generation_used integer not null default 0,
  starter_generation_used integer not null default 0,
  landmark_count integer not null default 0,
  photo_count integer not null default 0,
  storage_bytes_used bigint not null default 0,
  extra_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Server env:

```bash
ECHO_ENTITLEMENTS_STORE=supabase
ECHO_ENTITLEMENTS_TABLE=echo_entitlements
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

## Quota Semantics

- `generation_used`: successful monthly generations in `period_key`.
- `starter_generation_used`: lifetime successful generations consumed from the Free starter bucket.
- `landmark_count`: saved landmark/building count.
- `photo_count`: saved photo count.
- `storage_bytes_used`: current saved photo bytes. Production should use the actual stored object size from the storage provider, not a client estimate.
- `extra_credits`: one-off generation credits consumed after starter and monthly quota.

Deletion should call `/api/usage-quota` with `action: "release"` so `photo_count`, `landmark_count`, and `storage_bytes_used` can decrease with the deleted resource.

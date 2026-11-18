# Quota Persistence

## Current Store Modes

`server/entitlements.ts` now uses an entitlement store adapter:

- `FileEntitlementStore`: default store for a single persistent Node process, backed by `logs/entitlements.json` or `ECHO_ENTITLEMENTS_STORE_PATH`.
- `SupabaseEntitlementStore`: production-oriented mode, enabled with `ECHO_ENTITLEMENTS_STORE=supabase`.

Keep `file` only for a single persistent Node process. Use `supabase` for Vercel/serverless, multiple API instances, or payment-driven plan changes; serverless local files are not durable storage.

When `FileEntitlementStore` is used, `logs/entitlements.json` may be absent on a fresh server. The file is created and written automatically after the first authenticated user completes a successful generation and the server consumes quota. A missing file before any successful generation is expected and does not mean quota is disabled.

When `SupabaseEntitlementStore` is used, the corresponding `echo_entitlements`
row is also created on the first successful quota consumption, not at account
signup. Quota checks for a new account evaluate the default Free entitlement
without writing a row.

## Supabase Table

Recommended table name: `echo_entitlements` unless overridden by `ECHO_ENTITLEMENTS_TABLE`.
The runnable SQL is also kept in `supabase/002_entitlements.sql`.

```sql
create table if not exists public.echo_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro')),
  period_key text not null,
  generation_used integer not null default 0,
  starter_generation_used integer not null default 0,
  landmark_count integer not null default 0,
  photo_count integer not null default 0,
  storage_bytes_used bigint not null default 0,
  extra_credits integer not null default 0,
  generation_unlimited boolean not null default false,
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
- `generation_unlimited`: operator whitelist for unlimited image generation. It bypasses starter/monthly/extra generation counters but does not bypass saved landmark/photo/storage quotas.

Deletion should call `/api/usage-quota` with `action: "release"` so `photo_count`, `landmark_count`, and `storage_bytes_used` can decrease with the deleted resource.

## Enforcement Flow

1. The client sends its Supabase access token to `/api/generate`.
2. The server validates the token with Supabase Auth and uses the returned
   `auth.users.id` UUID as the entitlement key.
3. The server checks the user's entitlement before requesting an image. An
   exhausted quota returns HTTP `402`.
4. The server consumes one generation only after the provider returns an image
   successfully. A new Auth account does not immediately create an
   `echo_entitlements` row.
5. Cloud save limits use `/api/usage-quota` and track landmarks, photos, and
   bytes separately from image generations.

The generation check and consumption are currently separate read/write
operations, not one atomic database transaction. Parallel generation requests
can both pass the initial check, so this is not a strict concurrency-safe cap.

## Production Verification

The code defaults to file storage if `ECHO_ENTITLEMENTS_STORE` is absent. The
local `.env` checked on 2026-11-17 did not select Supabase storage or include a
service-role key, so local entitlement writes use the file store. A read-only
check of Vercel project `echo-map` on 2026-11-17 found no
`ECHO_ENTITLEMENTS_STORE`, `SUPABASE_URL`, or
`SUPABASE_SERVICE_ROLE_KEY` in the production environment-variable list. This
means Supabase quota persistence is not configured there through those
variables; the production `echo_entitlements` migration was not inspected.
No production configuration was changed. Verify the deployed code and
database migration before relying on production balances.

Operator commands:

```bash
npm run grant:credits -- <userId> <credits>
npm run grant:unlimited -- <userId|email>
npm run grant:unlimited -- <userId|email> --off
```

Email lookup for `grant:unlimited` requires server-side `SUPABASE_SERVICE_ROLE_KEY`; otherwise pass the Supabase Auth user id directly.

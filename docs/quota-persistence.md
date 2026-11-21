# Quota Persistence

## Current Store Modes

`server/entitlements.ts` now uses an entitlement store adapter:

- `FileEntitlementStore`: default validation mode, backed by `logs/entitlements.json` or `ECHO_ENTITLEMENTS_STORE_PATH`.
- `SupabaseEntitlementStore`: production-oriented mode, enabled with `ECHO_ENTITLEMENTS_STORE=supabase`.

Keep `file` for local validation or a single-process mock. Use `supabase` before running multiple API instances, serverless functions, or payment-driven plan changes.

## Supabase Table

Recommended table name: `echo_entitlements` unless overridden by `ECHO_ENTITLEMENTS_TABLE`.

The canonical schema is `supabase/002_entitlements.sql`; it keys rows by the
Supabase Auth UUID (`user_id uuid`) and enables row-level security.

Server env:

```bash
ECHO_ENTITLEMENTS_STORE=supabase
ECHO_ENTITLEMENTS_TABLE=echo_entitlements
ECHO_PAYMENT_ORDERS_STORE=supabase
SUPABASE_URL=https://your-project.supabase.co
# Prefer the current Supabase Secret API key. Keep it server-side only.
SUPABASE_SECRET_KEY=your_secret_key
# Legacy projects may continue using the service_role key.
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Both server keys must stay server-side only. The client-facing anon/publishable
key cannot write entitlement records under the table's RLS policy.

Apply `supabase/002_entitlements.sql`,
`supabase/003_payment_orders_and_credit_ledger.sql`,
`supabase/004_alipay_webpay.sql` when Alipay is enabled, and
`supabase/005_balance_and_purchased_plan.sql` before enabling these settings.
Payment order storage and entitlement storage must both use
Supabase: the `confirm_payment_order` database function locks the order row,
checks the amount and transaction identity, updates `echo_entitlements`, and
inserts the payment grant ledger event in one transaction. Repeated callbacks
return the confirmed order without granting credits again.

`credit_ledger` records payment grants, server-side generation consumption, and
admin adjustments. The Balance UI totals the unused Free starter/monthly quota
and paid credit balance; `last_purchased_plan` records the latest paid credit
package without silently changing the user's quota plan. RLS is enabled without
client-facing policies; only the server-side Supabase key should call the write
functions. File storage remains
useful for local/mock validation but does not provide a cross-process
transaction guarantee. Existing JSON order files are not imported by this
migration; reconcile pending orders before changing the store setting.

## Quota Semantics

- `generation_used`: successful monthly generations in `period_key`.
- `starter_generation_used`: lifetime successful generations consumed from the Free starter bucket.
- `landmark_count`: saved landmark/building count.
- `photo_count`: saved photo count.
- `storage_bytes_used`: current saved photo bytes. Production should use the actual stored object size from the storage provider, not a client estimate.
- `extra_credits`: one-off generation credits consumed after starter and monthly quota.

Deletion should call `/api/usage-quota` with `action: "release"` so `photo_count`, `landmark_count`, and `storage_bytes_used` can decrease with the deleted resource.

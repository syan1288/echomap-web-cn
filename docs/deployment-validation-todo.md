# Deployment Validation TODO

## Goal

Use the remaining Tencent Cloud Lighthouse term as the production validation window. Keep infrastructure small, avoid new recurring costs, and prepare a Vercel fallback before the Tencent Cloud renewal decision.

## Current Recommendation

- Keep Tencent Cloud Lighthouse as the mainland-facing production entry for now.
- Use same-domain deployment:
  - `/` serves the built frontend.
  - `/api/` proxies to the Node API on `127.0.0.1:3001`.
- Keep all AI provider keys on the server side only.
- Use Vercel as preview, overseas fallback, and post-expiry backup.

## Deployment Tasks

- [ ] Verify Tencent Cloud production is using the same-domain Nginx shape from `deploy/nginx.same-domain.example.conf`.
- [ ] Verify the Node API runs under systemd with `npm run api:start`.
- [ ] Verify `/api/echo-health` works through the public domain.
- [ ] Confirm `.env` on the server contains only the providers currently needed for validation.
- [ ] Set a default low-cost image provider for mainland users.
- [ ] Keep Gemini as optional instead of the default mainland path.
- [x] Add basic Free generation limits before opening wider traffic.
- [ ] Verify production `.env` sets Supabase server auth and quota variables.
- [ ] After the first authenticated successful generation, verify `logs/entitlements.json` is created at `ECHO_ENTITLEMENTS_STORE_PATH` and records the user's consumed quota.
- [ ] Before multi-instance production, migrate `ECHO_ENTITLEMENTS_STORE` from `file` to `supabase` using `docs/quota-persistence.md`.
- [ ] Configure manual payment URLs and verify `/api/payments/create-order` writes pending manual orders.
- [ ] If switching to official WeChat Pay, configure `ECHO_PAYMENT_PROVIDER=wechat_native` and validate `/api/payments/wechat/notify` grants credits after a real paid callback.
- [ ] Create a Vercel preview deployment with separate environment variables.
- [ ] Run one failover rehearsal before Tencent Cloud renewal: switch a test domain or preview domain to Vercel and verify core flows.

## Do Not Do Yet

- Do not add COS/CDN unless traffic or asset load proves it is needed.
- Do not build a public admin dashboard yet.
- Do not add multiple paid cloud services before revenue or active usage is visible.
- Do not hard-code payment logic to a single provider.

## Renewal Decision Check

Review before Tencent Cloud renewal:

- Daily visitors
- Registered users
- Image generations per day
- Generation success rate
- Estimated AI cost
- Payment button clicks
- Paid users
- Revenue

Decision:

- If usage and revenue are promising, renew Tencent Cloud and add payment/provider hardening.
- If users exist but do not pay, reduce free quota and keep the cheapest viable hosting.
- If usage is weak, do not renew Tencent Cloud; keep Vercel as a low-cost demo and preview environment.

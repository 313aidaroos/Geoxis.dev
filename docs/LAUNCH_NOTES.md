# Geoxis: launch notes

_Updated 2026-09-25. One notes file per repo: what was changed, file by file, and everything you need to connect. The full family report: https://claude.ai/artifact/QERxA6PMsFK1vdR51Ex2NQ_

## Status

The public globe is a demonstration. Customer telemetry ingestion and entitlement enforcement remain launch work. Plans are not on sale (`PLANS_ON_SALE=false`).

## Connect (in order)

1. **Apixis Wallet key.** In the ApixisWallet repo run `npm run family-keys` once. It prints one SQL block (paste it in the Wallet's Supabase SQL editor) and one env block per site. Paste this site's block: `WALLET_API_KEY`, `APIXIS_CLIENT_ID`, `APIXIS_WALLET_API_URL`.
2. Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. AI: `ANTHROPIC_API_KEY`.
4. `RESEND_API_KEY` for support email.

Every key this repo reads is listed in `spatial-dashboard/.env.example` (required, optional, and legacy names to leave unset).

## Apixis Wallet

App `geoxis`. Catalog has `geoxis.tracking.*`. Redeem answers 'not on sale' until you flip `PLANS_ON_SALE`.

## Database

`002_lock_current_asset_positions.sql` applied live (2026-09-23).

## Open items

- Root 'Meridian' prototype files next to `spatial-dashboard/` (`index.html`, `main.js`, `aiController.js`, `mapController.js`, `streamSimulator.js`, `uiController.js`, `README-2.md`) and the unused `spatial-dashboard/src/aiController.js`: not deployed, delete when convenient (`git rm` them; nothing imports them).
- Paste `spatial-dashboard/sql/003_revoke_anon_execute.sql` and `004_ingest_keys_entitlements.sql` in the Supabase SQL editor (2026-10-06).
- Point `geoxis.vercel.app` at the `spatial-dashboard` Vercel project.

## 2026-10-06 (Claude): build, auth, redeem and real-fleet ingest

| File | Change |
|---|---|
| `spatial-dashboard/vite.config.js` | `pricing.html`, `set-password.html`, `auth/callback.html` added to the build (they 404ed in production, so magic links broke). |
| `spatial-dashboard/set-password.html`, `auth/callback.html` | Sets `has_password` so the callback stops looping to set-password; redirects use clean URLs. |
| `spatial-dashboard/pricing.html` | Sends the session token to `/api/redeem` (it always got 401). |
| `spatial-dashboard/api/redeem.js` | Provision writes `public.entitlements`; unprovision deletes it; receipt saved after capture. |
| `spatial-dashboard/api/positions.js`, `api/ingest-keys.js`, `lib/ingest.js` | New: tenant ingest keys and `POST /api/positions`. See `docs/INGEST.md`. |
| `spatial-dashboard/api/assets.js` | Signed-in tenant with rows → their fleet; without rows → demo fleet flagged `demo: true`. |
| `spatial-dashboard/src/streamSimulator.js`, `src/main.js` | The globe poller sends the session token; toasts whose fleet is shown; stale token falls back to the public feed. |
| `spatial-dashboard/index.html`, `src/main.js`, `src/uiController.js` | Dead OpenAI key field removed from settings (Cixy runs server-side). |
| `spatial-dashboard/api/admin/support.js` | Only `status` is patched (a `reply` field used to 400 against the table). |
| `spatial-dashboard/sql/003_*.sql`, `004_*.sql` | Revoke anon EXECUTE on the two security-definer functions; `ingest_keys` + `entitlements` tables. |
| `spatial-dashboard/.env.example` | Six names the code reads were missing (`APIXIS_WORLD_KEY`, `APIXIS_WORLD_API`, `APIXIS_CLIENT_ID`, `APIXIS_REDIRECT_URI`, `AI_MODEL`, `ADMIN_EMAILS`). |
| `spatial-dashboard/test/ingest.test.mjs` | New tests for keys, position validation, entitlement expiry. |

## What changed, file by file

Each changed backend code file also starts with a one-line `Change note (Claude, Sep 2026)` comment saying the same thing.

| File | Change |
|---|---|
| `docs/LAUNCH_NOTES.md` | This file. |
| `spatial-dashboard/.env.example` | Added 9 key(s) the code reads that were missing: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `WALLET_API_KEY`, `APIXIS_WALLET_API_URL`, `APP_URL`, `APIXIS_WALLET_API_KEY`. |
| `spatial-dashboard/api/cixy.js` | Rate limited. |
| `spatial-dashboard/api/redeem.js` | 'Not on sale' instead of an error. |
| `spatial-dashboard/api/support.js` | Rate limited. |
| `spatial-dashboard/lib/rateLimit.js` | New. Per-IP limiter. |
| `spatial-dashboard/sql/002_lock_current_asset_positions.sql` | View is `security_invoker`; browser roles revoked (closed cross-customer read). |

_Changes are backend and plumbing only. Pages, design and UI are not changed except where noted as a build or lint fix with no visual change._

## 2026-10-05 readiness fixes (Codex)

Fixed Cesium basemap configuration with a packaged fallback; built pricing, auth callback, and password setup pages; compiled dashboard Tailwind locally; labelled demo and stale data; sent bearer auth with tenant fleet polling; preserved verified metadata for world onboarding; made callback/password pages use the app session; removed unused OpenAI key settings; escaped feed/agent text; and added `npm run check` plus regression coverage.

Validation: production build, 27 tests, shipped-page and API-import checks. Browser preview confirmed satellite imagery, live/demo source labels, asset selection, settings, pricing availability messaging, and responsive layout. Auth/World regressions use stubbed services; no real password change, signup, or purchase was performed.

Remaining: configure/verify production service keys, rehearse real sign-in/onboarding with a test account, integrate customer telemetry, and implement/enforce paid entitlements before opening sales.

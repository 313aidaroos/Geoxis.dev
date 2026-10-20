# RUNTIME UPDATE — 2026-10-09

This integration now has code on **this draft branch**, but remains **disabled** until the owner follows the [central Orbit setup runbook](https://github.com/313aidaroos/Apixis.dev/blob/feat/orbit-lite-safe-core-20261009/docs/ORBIT_OWNER_ACTIONS.md). The status is **implemented_gated / runtimeConnected=false**. Do not claim live cross-site execution. Route: POST /api/orbit/assets. Server-only key: ORBIT_GEOXIS_SHARED_SECRET.

Files: `spatial-dashboard/lib/orbit.js`, `spatial-dashboard/api/orbit/assets.js`, `spatial-dashboard/test/orbit.test.mjs`.

Geoxis verifies signed Apixis ID subject against its existing Supabase Auth user, then checks tenant membership and reads only its real current positions; it never uses the demo fallback.

Review CI, explicit test accounts, actual Vercel project and secrets in Preview before enabling the corresponding Core flag. The existing rules in this project's AGENTS.md and README remain authoritative. Read-only-only: no payment, bid, external email, settlement or asset control.

---

# Orbit integration handoff — Geoxis (2026-10-09)

**Status: NOT CONNECTED.** This branch adds a repo-specific build contract and a machine-readable capability declaration. It does not expose an API or integrate product data yet.

## Existing evidence
The existing `spatial-dashboard/api/assets.js` uses `authContext(req)` and `listTenantAssets(ctx.tenant.id)` for a signed-in user's assets; when a tenant has no real positions, it explicitly emits `demo: true`. Real positions are ingested through `spatial-dashboard/api/positions.js`.

## First safe capability
- ID: `geoxis.asset.read` · Mode: `read` · Status: `planned`.
- Intended behavior: Return a bounded position/freshness summary for exactly one approved asset owned by the authenticated tenant; suppress cross-tenant data and reject demo snapshots as real telemetry.
- Proposed route: `GET /api/orbit/v1/assets/:assetId (proposed; do not expose until verified)`

## Build tasks
1. Add a product-side server-only signed Orbit request verifier (no anonymous demo fallback on adapter route).
2. Bind Apixis ID subject to a verified Geoxis user/tenant; do not let the Orbit hub choose a tenant.
3. Read the already tenant-filtered positions; return `recordedAt` and a stale flag; never synthesize a position.
4. Add A/B tenant tests, replay/expiry tests, explicit `demo` and no-position tests.
5. Only then enable `geoxis.asset.read` in Orbit Core.

## Shared Apixis rules
- Orbit Core proposal: https://github.com/313aidaroos/Apixis.dev/pull/86 (draft). This repo is **NOT connected** to Orbit by this documentation PR.
- Use the existing Apixis ID subject and product tenant binding; never trust an email, tenant ID, or asset ID passed by the browser without server-side authorization.
- Preserve existing ApixisWallet as the sole customer-credit ledger; no duplicate balance, checkout or hidden fee. The product's own approval, RLS, licensing and audit requirements remain authoritative.
- Orbit requests are scoped **read-only** or **draft-only** until an independently reviewed explicit-approval flow exists. No direct payment, order acceptance, outreach, trade, settlement or emergency action.
- Never present previews, stale positions, sample findings, fabricated prices or demo data as live activity.
- A later server-to-server adapter must use dedicated, rotated service authentication, replay prevention, per-actor authorization, audit logs, rate limiting and bounded timeout/retries.

## Proposed response contract (not live)
```json
{
  "version": "orbit-adapter-v1",
  "capability": "<capability-id>",
  "source": "<venture>",
  "demo": false,
  "sourceRecordedAt": "<ISO8601>",
  "summary": "<short factual result>",
  "data": {}
}
```
The source timestamp and demo flag must reflect actual data. Never substitute the request timestamp for the source timestamp. For missing credentials or incomplete deployment return an explicit unavailable error, not an empty successful real-world result.

## Verification before enablement
- Signed-out and wrong-tenant calls denied; verified same-owner call succeeds.
- Existing app functions and existing private data remain intact.
- Real data has provenance/time; sample data is flagged demo.
- Missing service credentials fail closed.
- All financial/external/write actions remain blocked.
- Automated tests include two-account tenant isolation and failed/retried network requests.

**Do not enable the matching Orbit Core capability until a code-level adapter, tests and production credential setup are reviewed.**

# Claude notes (Geoxis)

Dated notes from Claude (Claude Code), same purpose as `NOTES/GROK.md`: what Claude checked or changed here, what it found, what is still open and who owns it. The one family status board is `ApixisWallet/docs/FAMILY_STATUS.md`.

## 2026-10-04 (UTC) — Claude: full-portfolio review (read-only; this note and the AI_CHANGELOG line are the only changes)

### Snapshot
- Reviewed `main` @ `2c0f0e1`; the owner admin allowlist merged → `main` is `cd656ff`. The app is `spatial-dashboard/`; Vercel project `spatial-dashboard` (alias `spatial-dashboard-xi.vercel.app`) production READY.
- Supabase `ncifprfgastofurrlsko`: 2 tracked migrations, applied — `lock_admin_emails` (the 09-23 critical fix) and `lock_current_asset_positions_view`.
- Open PR per the family board: #7 footer.

### Verified this session (`spatial-dashboard/`, on 2c0f0e1)
- `npm test` (node --test) and `npm run build` (vite): pass on Node 22. No lint / typecheck scripts. This repo has its own CI workflow (working-directory `spatial-dashboard`) rather than the shared caller.
- `api/redeem.js` has `PLANS_ON_SALE = false` ✓ (nothing sells).
- SDK: `apixis-cixy.js` and the world kit identical to canonical; `lib/apixis-wallet.js` / `lib/apixis-login.js` are JS ports (no canonical JS SDK exists).
- Advisors: `is_admin_user()` and `is_member()` are SECURITY DEFINER and executable by anon + authenticated (open since the 09-23 scan — revoke from anon); `admin_emails` RLS on, no policy (INFO); leaked-password WARN.

### Done (live)
3D globe with fleet positions + OpenSky ADS-B, login / set-password / admin / pricing / support pages, Apixis ID start + callback, Wallet balance + redeem route (gated off), world agent + welcome card, Cixy on the shared core, admin_emails locked, CI.

### Open — needs Awad
- What Geoxis sells — the `geoxis.tracking.*` and `geoxis.export.report` SKUs already exist in the Wallet catalog; `PLANS_ON_SALE` stays false until you say.
- PR #7 footer.

### Open — Claude can do on your go
- Archive or remove the root-level legacy "Meridian" demo (`index.html`, `main.js`, `aiController.js` with OpenAI Realtime, `mapController.js`, `streamSimulator.js`, `uiController.js`, `README-2.md`) — it is not deployed and confuses every reader.
- Revoke anon EXECUTE on `is_admin_user()` / `is_member()`.
- `spatial-dashboard/public/companies.html` links Ominix to `nexxis-tau.vercel.app`; `spatial-dashboard/docs/PROVISION_KIT.md` still says 200 starter Ixis.
- The Wallet's return-host list includes `geoxis.vercel.app`, which is not this project (harmless; tidy).

## 2026-10-06 (UTC) — Claude: build/auth/redeem fixes + real-fleet ingest (branch `claude/zealous-wozniak-p1zp30`)

### Found (code, not in any earlier note)
- Only index/login/support/admin were in the Vite build. `pricing.html`, `set-password.html` and `auth/callback.html` 404ed in production, so magic-link sign-in for existing accounts was broken (Grok flagged it 2026-09-27 as pre-existing; never fixed). Apixis ID sign-in was unaffected.
- The globe poller never sent the session token, so the tenant branch of `/api/assets` was unreachable from the UI, and nothing anywhere wrote to `tracked_assets` / `asset_positions`. The "6 live tracked assets" in the notes are the hard-coded demo fleet in `lib/fleetEngine.js`.
- `pricing.html` called `/api/redeem` without the token → 401 before the not-on-sale check. Provision/unprovision were TODO stubs.
- `api/admin/support.js` forwarded a `reply` field the table does not have.

### Changed
See the 2026-10-06 table in `docs/LAUNCH_NOTES.md` and `docs/INGEST.md`. `npm test` 20 tests green, `npm run build` green with 9 HTML pages in `dist/`.

### Needs Awad
- Supabase SQL editor: paste `sql/003_revoke_anon_execute.sql` then `sql/004_ingest_keys_entitlements.sql`.
- Delete the root Meridian files + `spatial-dashboard/src/aiController.js` (`git rm`; this session was not allowed to delete files).
- Point `geoxis.vercel.app` at the `spatial-dashboard` project; flip `PLANS_ON_SALE` when ready.
- If the Supabase redirect allowlist is exact-match, keep `/auth/callback.html` (unchanged) in it.

## 2026-10-06 (later, UTC) — Claude: PR #28 merged + deployed, database migrations applied
- PR #28 squash-merged to `main` as `a01d681`; Vercel production deployment READY on that commit.
- Supabase: 003 and 004 applied and verified (see AI_CHANGELOG). The advisor WARN that `authenticated` can execute the two SECURITY DEFINER functions is intentional: RLS policies call them as the signed-in role, and they only return booleans about the caller.
- Still Awad's: delete the root Meridian files; point `geoxis.vercel.app` at the `spatial-dashboard` project; decide on the redesign proposal (board image sent 2026-10-06).


## 2026-10-17 (UTC) — Claude: front-end redesign (branch `claude/redesign-live-globe`, PR for Awad's review)

### What Awad asked for (chat, 2026-10-17)
Four reference mocks: spinning globe, click to zoom into the atmosphere, live planes/ships/freight/trucks moving, click one → the real photo and details. Answers to my questions: font does not matter (Inter chosen); brand kit from the repo; colorful; day and night as it spins, based on where the site is opened; landing page shows the necessary information; spin 1 turn / 2 min with auto-resume; nav = Overview, Live Globe, Fleet, Track, Pricing, Companies, Feed, Cixy; Fleet page yes; worldwide aircraft, click one → others disappear, exit → they come back; AISStream key later; real photos yes; routes for the selected asset + a layer for all; weather + risk zones shown; Cixy picture coming; four quick prompts; Cixy to the right of the globe with the text box under it; reskin every page; mobile stacks; timeline last 30 min; one PR, review first; universe (stars, Milky Way, galaxies, moon) animated behind the globe.

### Built (see AI_CHANGELOG 2026-10-17 for the file list)
Everything above. Verified locally: `npm test` 52/52, `npm run build` 12 pages, Playwright run of every page with console capture (only errors are the sandbox blocking tile/font hosts). Live feeds could not be exercised from the sandbox (egress blocks opensky-network.org, api.adsbdb.com, api.planespotters.net, gibs.earthdata.nasa.gov); they are built to the documented contracts and need a look on the Vercel preview.

### Honest limits
- Anonymous OpenSky allows one worldwide refresh every 15 minutes; planes move smoothly between refreshes by dead reckoning from speed and track. A free OpenSky account (two env vars) makes it 90 seconds.
- Ships are the Rotterdam demo vessels until `AISSTREAM_API_KEY` is set; AIS is sampled for 6 s per request and CDN-cached per map box for a minute.
- Trucks and freight only come from customers' ingest keys (no public source). Demo rows carry a DEMO badge.
- Ship photos are best-effort from Wikimedia Commons; aircraft photos are the exact airframe (Planespotters via adsbdb, credit shown).
- The globe is a real Earth (satellite imagery, real terminator, NASA city lights), not the painted look of the mocks.

### Needs Awad
Review the PR. Send `cixy.png` for `public/brand/`. Optional: OpenSky and AISStream keys in Vercel. Domain `geoxis.vercel.app` still belongs to another Vercel project (see 2026-10-06 Grok note); the site now uses it as its canonical URL in meta tags, so the move is wanted.

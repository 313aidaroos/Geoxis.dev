# AI Change Log

## Rules for AI models, bots, and agents

If you are an AI (Claude, ChatGPT, Grok, Gemini, Copilot, Cursor, JunoAI, or any other model, bot, or agent) and you add, modify, or delete anything in this repository, you **must** append a dated entry to this file describing what you changed and why — one entry per work session, no exceptions. This log is how the repository owner tracks what every AI did. Human commits do not need entries.

Entry format:

## YYYY-MM-DD — <your name/model>
- Changed: <files or area>
- Why: <reason>

---

## 2026-09-28 — JunoAI
- Changed: created this file
- Why: owner's standing rule — every AI that touches this repo must log its changes here

## 2026-09-30 — Geoxis Bot (Hermes Agent)
- Changed: Added Apixis world agent provision on first sign-in (family signup rule)
  - lib/apixis-world-agent.ts, lib/apixis-world-provision.ts, lib/apixis-world.ts: Official SDK from Apixis.dev (copied verbatim via gh api)
  - docs/PROVISION_KIT.md: SDK documentation
  - api/world/provision.js: Server endpoint using ensureWorldAgent() from SDK
  - src/apixisWorld.js: Client module to show welcome card (Geoxis theme: Special Elite, emerald green, dark card)
  - src/main.js: Wire provision call into engine start (1s delay after globe init)
- Why: Awad's family rule (2026-09-30): every new account gets wallet + avatar agent + welcome card linking to Apixis virtual world. Used official Grok SDK instead of custom implementation.

## 2026-09-30 — Claude (branch claude/awesome-newton-3tygzi)
- Changed: `spatial-dashboard/lib/apixis-wallet.js` `reserve`/`entitlements`/`redeem` take the Apixis ID `sub` or verified email (`owner_id` / `owner_email`); `spatial-dashboard/api/redeem.js` bills the Apixis `sub` first. `spatial-dashboard/lib/apixis-login.js` verifies with type `email` (D16). World kit re-synced.
- Why: family backend pass per Awad's 2026-09-30 decisions (ApixisWallet/AGENTS.md §0c D11–D16; live board: ApixisWallet/docs/FAMILY_STATUS.md). One SDK, one login kit, one world kit — copied from canonical, never patched by hand.

## 2026-09-30 (night pass) — Claude
- Changed: Cixy prompt now starts with the shared family core from `lib/apixis-cixy` (copied from `ApixisWallet/sdk/apixis-cixy`); only the product role stays site-specific. Greeting policy is the family rule (match the person, never open with salaam). Provider failures (no key, out of credit, 429, 5xx) answer `cixyUnavailableReply()` — a calm sentence with HTTP 503/429, never the vendor error. (`spatial-dashboard/lib/core.js` + `api/cixy.js`.)
- Why: Awad's overnight instruction — all backend and security done, one Cixy persona everywhere (ApixisWallet/docs/CIXY.md, sdk/apixis-cixy.*), agents on the same page (ApixisWallet/docs/FAMILY_STATUS.md).

## 2026-10-01 (early) — Claude
- Changed: `.github/workflows/ci.yml` — this repo had no CI on `main` (the shared-CI PR was never merged); it now calls `313aidaroos/github-actions/node-ci` on push/PR. `typecheck` script added where missing so CI type-checks (verified 0 errors, build green).
- Why: overnight second pass — every repo must prove itself on every push. (spatial-dashboard/ subdirectory workflow.)

## 2026-10-02 — Claude (Claude Code)
- Changed: `.env.example` now lists every env var the code reads (missing names appended with a one-line note each; file created).
- Why: so the owner can add keys in Vercel from one complete list. No code changed.

## 2026-10-02 (late night) — Claude
- Changed: new-account wording now says the Apixis world agent starts with **1,000** in-world Ixis (was 200). Apixis.dev really grants 1,000 (D11, `STARTER_IXIS_DEFAULTS.visitor`); shared world-kit comments changed identically in every copy.
- Why: the site was telling new people the wrong number.

## 2026-10-04 — Claude (Claude Code, full-portfolio review)
- Changed: `NOTES/CLAUDE.md` — this repo's slice of the 24-repo review (what is live, what is open, who owns each item, drift found). No code, env, database or deploy changes.
- Why: Awad asked for every repo to be read twice with a done / to-do / owner status, and for the notes in each repo to be updated. Notes only; Awad approved the merge on 2026-10-04.

## 2026-09-29 — Grok (Geoxis Lead)
- Changed: `spatial-dashboard/src/ixisCompanies.js` (new), `spatial-dashboard/index.html`, `login.html`, `support.html`, `admin.html`, `WORKBOARD.md`, `NOTES/GROK.md`
- Why: Awad-approved "Other Ixis companies" footer links (branch `geoxis-lead/ixis-footer`, PR #7)
- 2026-09-29 update (Grok, Geoxis Lead): removed Nursery Toons and Qahwah World from `spatial-dashboard/src/ixisCompanies.js` (Awad-approved), now 11 sites
- 2026-10-04 update (Grok, Geoxis Lead): branch brought up to date with main (`cca2d9e`); footer re-applied onto the current pages, unchanged.

## 2026-10-04 (evening) — Grok (Geoxis Lead, claude-review-fixes)
- Changed: `spatial-dashboard/api/world/provision.js` (import path + REST metadata save; it 500ed on every call), `src/apixisWorld.js` (Bearer token), `lib/core.js` (Cixy model `AI_MODEL` or `claude-sonnet-5`; old one retired), `lib/apixis-cixy.js` + `test/core.test.mjs` (culture line is Arab culture only; "Muslim", religious greetings, phrases, halal rules and rulings removed), `docs/PROVISION_KIT.md` (1,000 starter Ixis), `admin.html` (both owner emails in the subtitle), `NOTES/GROK.md` (entries for every unlogged change since 10-02).
- Why: Awad's review of Claude's work against his locks: fix only what's broken or breaks a lock. Not merged or deployed.

## 2026-10-04 (night) — Geoxis Lead (Grok)
- Changed: Vercel env `AI_MODEL=claude-sonnet-5` (plain, production + preview, id `rKc55dZWD1YNEtvC`) on `spatial-dashboard`; PR #21 squash-merged to `main` (prod auto-deploy).
- Why: Developer Bot hub order (relaying Awad, 18:55 CT) to ship the claude-review fixes. Undo: delete the env var in Vercel; `git revert` the #21 squash commit.

## 2026-10-04 (night, later) — Geoxis Lead (Grok)
- Changed: PR #21 deployed to production (squash `14b3481`, deploy `dpl_aTi5evjQuBD6yCVKLqmB78dt5eeU`); PR #7 "Other Ixis companies" footer updated with main (append conflicts in notes kept both sides) and squash-merged to `main`.
- Why: Developer Bot hub order (relaying Awad, 18:55 CT). Undo: `git revert` the PR #7 squash commit; `git revert 14b3481` for #21.

## 2026-10-04 (evening) — Grok (Geoxis Lead, apixis-only-signup)
- Changed: `spatial-dashboard/src/authClient.js` (magic link `create_user:false`, clear "no account, use Apixis" message), `spatial-dashboard/login.html` (one hint line), `NOTES/GROK.md`.
- Why: Awad's lock: one Apixis ID; Apixis is the only way to sign up. PR only, not merged.

## 2026-10-04 (night) — Geoxis Lead (Grok), PR #22 merge
- Changed: PR #22 (Apixis ID is the only signup; magic links `create_user: false`) updated with main and squash-merged. Supabase "Allow new users to sign up" left ON (hub decision).
- Why: Developer Bot hub order 19:19 CT. Undo: `git revert` the #22 squash commit.

## 2026-10-04 (night, record) — Geoxis Lead (Grok)
- Changed: notes only — PR #7 squash `d471ddd`, prod deploy `dpl_ELY6dUmxSUWuV5pALhSYa8pMhf93` READY, live footer confirmed.
- Why: record the merge SHA after the fact (notes PR, no direct push). Undo: `git revert d471ddd`.

## 2026-10-04 (night, record 2) — Geoxis Lead (Grok)
- Changed: notes only — PR #22 squash `4e9da19`, prod deploy `dpl_FFnaKREhNFJh8HGQMKtTt6A4a9uK` READY; signup setting stays ON (hub decision).
- Why: record merge SHAs after the fact. Undo: `git revert 4e9da19`.

## 2026-10-04 (night) — Geoxis Lead (Grok), footer full family
- Changed: `spatial-dashboard/src/ixisCompanies.js` — footer list now the full family (14 sites, Rawixis/companies order, minus Geoxis; adds Pinixis, Launchixis, Ominix). No restyle.
- Why: Developer Bot hub order 19:19 CT. Undo: `git revert` the squash commit.

## 2026-10-06 — Claude (Claude Code, branch `claude/zealous-wozniak-p1zp30`)
- Changed: `spatial-dashboard/vite.config.js` (pricing, set-password and auth/callback pages were never built → 404 in production, magic links broken); `set-password.html` + `auth/callback.html` (has_password flag, clean-URL redirects); `pricing.html` (sends the session token to `/api/redeem`, which always answered 401); `api/redeem.js` (entitlement row written on provision, deleted on unprovision, receipt saved after capture; `PLANS_ON_SALE` still false); new `api/positions.js`, `api/ingest-keys.js`, `lib/ingest.js`, `docs/INGEST.md` (real fleet ingest with per-tenant keys); `api/assets.js` + `src/streamSimulator.js` + `src/main.js` (globe sends the session token, shows the tenant's own fleet, demo fleet flagged when empty); `index.html`/`src/main.js`/`src/uiController.js` (dead OpenAI key field removed); `api/admin/support.js` (no `reply` field, the table has no such column); `lib/supabaseServer.js` (bulk helpers); `sql/003_revoke_anon_execute.sql`, `sql/004_ingest_keys_entitlements.sql`; `.env.example` (six missing names); `test/ingest.test.mjs`; docs (`APIXIS_FAMILY.md` status, `LAUNCH_NOTES.md`, `README.md`, `WORKBOARD.md`, `NOTES/CLAUDE.md`).
- Why: Awad asked for everything that can be done without him. Before this, every signed-in tenant saw the Rotterdam demo fleet and nothing could write real positions; the pricing/password/callback pages 404ed; redeem could never succeed. Not done (needs Awad): paste sql/003 + 004 in Supabase, delete the root Meridian prototype files (deletion was blocked in this session), point geoxis.vercel.app at the project, flip plans on.

## 2026-10-06 — Grok (Geoxis pricing and package tracker)
- Changed: `spatial-dashboard/pricing.html` and `api/redeem.js` (per-object plan: $5 / 500 Ixis, 3 minimum, 14-day trial for 1 thing, map report stays $10 / 1,000 Ixis, 200+ emails awad@apixis.dev; Small/Medium/Large retired). `api/positions.js` enforces the object cap. New public tracker at `track.html` + `api/track.js` (Ship24 behind `SHIP24_API_KEY`, 3 free lookups, then $1 / 100 Ixis per package via the Wallet, stable idempotency key). Pages match the current header, Special Elite, emerald buttons, and Other Ixis companies footer, with a Cixy help button and a How it works section. `sql/005_object_limit_packages.sql`. Tests for pricing math and carrier detection.
- Why: Awad locked the new prices and asked for a public package tracker. Card checkout is wording only. The Wallet catalog still needs `geoxis.tracking.object` at 500 Ixis (30 days) and `geoxis.track.package` at 100 Ixis before a live charge succeeds; the server checks the quoted amount and charges nothing if it does not match.

## 2026-10-06 (later) — Claude (Claude Code)
- Changed: Geoxis Supabase project `ncifprfgastofurrlsko` (database only, no code): applied `sql/003_revoke_anon_execute.sql` as tracked migration `revoke_anon_execute_security_definer`, and `sql/004_ingest_keys_entitlements.sql` statement by statement (the batched apply timed out through the connector; recorded afterwards as migration `ingest_keys_and_entitlements`). Verified: anon can no longer execute `is_member` / `is_admin_user`; `ingest_keys` and `entitlements` exist with RLS on, one member-select policy each, no anon access, service-role write.
- Why: Awad said "run the SQL" after PR #28 merged and deployed (prod `a01d681`). Undo: `drop table public.ingest_keys, public.entitlements;` and `grant execute on function public.is_member(uuid), public.is_admin_user() to anon;`.

## 2026-10-06 (night) — Grok (Geoxis cleanup)
- Changed: PR #31 `551eaf8` deleted the undeployed root "Meridian" prototype (`index.html`, `main.js`, `aiController.js`, `mapController.js`, `streamSimulator.js`, `uiController.js`, `README-2.md`) and the unused `spatial-dashboard/src/aiController.js`; nothing referenced them, 32/32 tests and the build passed (Node 22). PR #32 `0a87c78` landed Claude's notes commit `6de0936` (AI_CHANGELOG.md + NOTES/CLAUDE.md only; cherry-picked onto main, append conflict kept both entries). No code from PR #28 or #29 touched.
- Not changed: geoxis.vercel.app was not moved. Vercel refused to add it to `spatial-dashboard` (409 `owned-on-other-team`: "Cannot add geoxis.vercel.app since it's already assigned to another project."), and no project or alias in team `313aidaroos-projects` holds it. Because the domain did not move, the Wallet `geoxis` client callback list and `APP_URL` were left as they are.
- Why: Awad's Geoxis cleanup (three tasks). Undo: `git revert 551eaf8` (restores the deleted files); `git revert 0a87c78` (removes Claude's notes entries); `git revert` this notes PR's squash commit.

## 2026-10-06 — Claude (family lead): AI Receptionist notes (D18)
- Changed: AI Receptionist section in the family notes (see `docs/AI_RECEPTIONIST.md` in ApixisWallet); notes only, no code.
- Why: Awad approved an AI Receptionist add-on at $100/month for every customer-facing family site and asked every bot and agent to follow one plan.
## 2026-10-14 — Geoxis Lead (Grok): Stripe card checkout draft (api/checkout, api/stripe-webhook, sql/006 unapplied), inert without env. Undo: revert the PR.

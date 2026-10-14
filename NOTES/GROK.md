Grok Bot (Developer Bot hub + product leads) notes. Every change Grok Bot makes to this product (code, env, database, deploys) gets a dated entry here so Claude, Hermes and Codex stay on the same page.

## 2026-10-04 summary

- **Grok:** added the two-owner admin allowlist and inserted the Gmail owner row in production.
- **Claude:** merged PR #20 (`4c09ca2`) around 6:30 PM CT, adding the full-portfolio review to `NOTES/CLAUDE.md` and `AI_CHANGELOG.md` (notes/docs only).
- **Hermes:** no 2026-10-04 commit or merged PR identified in this repository.
- **Juno:** no 2026-10-04 commit or merged PR identified in this repository.

## Catch-up correction — 2026-10-04 (CT)

Claude activity was present; the earlier “no Claude activity” line was incorrect. Each item below has an undo pointer.

- **Claude, 2026-10-04 6:31 PM CT — PR #20, merge `4c09ca24de0c37965000d171bb62187861060369`:** notes: Claude full-portfolio review 2026-10-04 (NOTES/CLAUDE.md, AI_CHANGELOG); added `NOTES/CLAUDE.md` and `AI_CHANGELOG.md` (notes/docs only). Undo: `git revert 4c09ca24de0c37965000d171bb62187861060369`.
- **2026-10-04 6:31 PM CT — 313aidaroos:** `notes: Claude full-portfolio review 2026-10-04 (NOTES/CLAUDE.md, AI_CHANGELOG) (#20)` landed as `4c09ca24de0c37965000d171bb62187861060369`. Where: commit `4c09ca24de0c37965000d171bb62187861060369`. Undo: `git revert 4c09ca24de0c37965000d171bb62187861060369`.

## 2026-09-27 (CT) — Developer Bot (hub)
- Wallet registration: added `geoxis` to `wallet_api_clients` in Supabase project `kzneeksminozmhnqaaun`, with `require_sso=false`.
- Callback URLs registered: https://spatial-dashboard-xi.vercel.app/auth/apixis/callback; https://spatial-dashboard-xi.vercel.app/api/auth/apixis/callback.
- Vercel env: replaced `WALLET_API_KEY` with a per-product `apx_live_` key, added `APIXIS_CLIENT_ID=geoxis`, and left legacy `APIXIS_WALLET_API_KEY` present (name-only check); production was redeployed from the same product commit.
- Cleanup status: the attempted deletion of legacy `APIXIS_WALLET_API_KEY` variables was stopped at about 22:45 CT; no deletion was made here.
- Undo: restore `WALLET_API_KEY` to its legacy value and deactivate the `geoxis` client row.

## 2026-09-27 — Apixis Wallet balance pill + Sign in with Apixis (Grok Bot)
- **What (PR #5, merge ceca075):** header balance pill on every screen + "Sign in with Apixis" (Awad-approved, product side only). All under `spatial-dashboard/`:
  - `lib/apixis-wallet.js`: appended SDK v3 `walletBalance`, `ownerQuery`, `apixisLoginUrl`, `exchangeLoginCode`, `buyIxisUrl` (existing functions/redeem unchanged).
  - `lib/apixis-login.js` + `api/auth/apixis/start.js` / `callback.js`; `vercel.json` rewrites `/auth/apixis/start|callback` → `/api/auth/apixis/*`. Callback creates/finds the Supabase user (app_metadata.apixis_sub), verifies a magic-link token server-side and hands the session to `/login` via the URL hash; `login.html` now goes straight to `next` when a hash token is consumed, and has a "Sign in with Apixis" button.
  - `api/wallet/balance.js` (Bearer session token): 401 `{signIn:true}` without a session; owner = Apixis `sub` when linked, else verified email.
  - `src/walletPill.js` (script on index, support, admin): slim row under the sidebar logo on the globe; next to "← Geoxis globe" on support/admin. Refetch on focus / visibilitychange / pageshow.
- **Verified:** prod READY; `/api/wallet/balance` → 401; `/auth/apixis/start` → 302 to Wallet `/sso/authorize?client_id=geoxis`.
- **Heads-up (pre-existing, not changed):** magic links point at `/auth/callback.html`, which isn't in the Vite build (prod 404); `pricing.html` / `set-password.html` also aren't built.
- **Undo:** `git revert -m 1 ceca075` (or revert PR #5).
- No Wallet code, env/keys, Stripe, checkout or payment links changed.

## Backfill 2026-10-02 (by Geoxis Lead / Grok)
Read-only backfill of everything that changed after the 2026-09-27 entries above and was not yet logged here. Sources: GitHub commits/PRs/timeline API, `AI_CHANGELOG.md`, Vercel (env var **names** and production deploys only, no values), and the 2026-10-02 status audit. All times are CT. Every commit, merge, closure and env edit was made through the `313aidaroos` GitHub/Vercel account. The agent named comes from branch names, `AI_CHANGELOG.md`, PR bodies and comments; **[inferred]** marks attributions that are not confirmed. Already logged above and not repeated: the 09-27 hub entry (`APIXIS_CLIENT_ID` added and `WALLET_API_KEY` updated at 22:35, prod redeploy of `0bdd7d6` at 22:39) and PR #5 (`5c1b077` / merge `ceca075`).

### 2026-09-27 13:52 CT — empty "trigger deploy" commit
- What: empty commit "chore: trigger deploy for QA verification" (no files). Prod deploy `dpl_5P9WkDQREw1WByv5aF98JVoWWXiX` READY.
- Where: main `6a68024`.
- Who: **unattributed**. The git author is "Awad Alaidaroos" (noreply email), and no agent note exists.
- Undo: nothing to undo (no file changes). `git revert 6a68024` would also be a no-op.

### 2026-09-27 13:56 CT — Cixy model string + clean URLs
- What: `spatial-dashboard/lib/core.js` model `claude-sonnet-4-5` → `claude-sonnet-4-20250514`. `spatial-dashboard/vercel.json` gets `"cleanUrls": true, "trailingSlash": false`. Prod deploy `dpl_uZcvqsxArJjejcEqgCGjRew62dpn`. (The 10-02 audit says this model is now retired, and Cixy shows the calm "unavailable" fallback from PR #10.)
- Where: main `0bdd7d6`, pushed direct (no PR).
- Who: **unattributed**. The git author is "Awad Alaidaroos" (noreply email), and there is no `AI_CHANGELOG.md` entry.
- Undo: `git revert 0bdd7d6`. Better: set an active model in `lib/core.js`.

### 2026-09-27 23:19 / 2026-09-28 00:11 CT — notes-only commits
- What: created this file (`e6b23c9`) and added the PR #5 entry (`99376d8`). Both are `[skip ci]`, but Vercel still deployed (`dpl_HH5fziKHyZi4w1ubViewUwJUxnTz`, `dpl_8HQ9V7NH4xKp74YgD8qBZ44gqayW`).
- Where: main, `NOTES/GROK.md` only.
- Who: Developer Bot hub / Grok (per the entries themselves).
- Undo: `git revert 99376d8 e6b23c9` (notes only).

### 2026-09-28 04:08 CT — PR #6 `AI_CHANGELOG.md` rule (Juno)
- What: added `AI_CHANGELOG.md`. Every AI that touches the repo must append a dated entry. Prod deploy `dpl_2w4hcrQJZiYYCtvBAk6ufPh99Ew6`.
- Where: PR #6, branch `junoai/ai-changelog` (opened 03:48 CT, squash-merged as main `ded0171`). The branch is still present (tip `ccd81c8`, the pre-squash commit). No `juno/*` branches exist.
- Who: JunoAI (confirmed by the first `AI_CHANGELOG.md` entry). Merged through the `313aidaroos` account.
- Undo: `git revert ded0171`; delete branch `junoai/ai-changelog`.

### 2026-09-28 04:47 CT — PR #1 Apixis family notes (Claude)
- What: added `CLAUDE.md` + `docs/APIXIS_FAMILY.md` (shared Wallet rules, status, env). Prod deploy `dpl_6w9zdEzn3CSPNZBTQf6tE8nWFfZi`. The status section in `APIXIS_FAMILY.md` is dated 09-23 and is now stale.
- Where: PR #1, branch `claude/apixis-family-notes` (opened 09-23), merged as main `3f489f0`.
- Who: Claude (branch name).
- Undo: `git revert 3f489f0`.

### 2026-09-29 20:33–20:40 CT — PR #7 "Other Ixis companies" footer (branch only, NOT on main)
- What: commits `8b83623` (20:33) + `705f485` (20:40; the list was cut to 11 sites, though the PR body still says 13). Adds `spatial-dashboard/src/ixisCompanies.js`, edits index/login/support/admin, and adds `WORKBOARD.md`, `AI_CHANGELOG.md` and `NOTES/GROK.md` entries **on the branch only**.
- Where: PR #7, branch `geoxis-lead/ixis-footer`. **Still OPEN** and now conflicting (2 ahead / 13 behind main). Body: "Do not merge until Awad reviews."
- Who: Geoxis Lead / Grok **[inferred]** from the `geoxis-lead/` branch prefix.
- Undo: nothing is on main. To drop the work, close PR #7 and delete the branch (needs Awad's decision; not done here).

### 2026-09-29 20:53–20:55 CT — PR #8 one account / world agent (branch only, NOT on main)
- What: commits `834aa5f` (20:53) + `8af9d0d` (20:55). Provisioning at the Apixis ID callback, `agent{}` in `/api/wallet/balance`, the "Your agent is in the Apixis world ↗" link, "Log in with Apixis ID", and 5 tests. Also adds `WORKBOARD.md`, `AI_CHANGELOG.md` and `NOTES/GROK.md` entries **on the branch only**.
- Where: PR #8, branch `geoxis-lead/one-account` (2 ahead / 13 behind). It was closed on 10-01 (see below).
- Who: Geoxis Lead (Grok). Confirmed by the PR body.
- Undo: nothing is on main. The branch is kept.

### 2026-09-29 23:16–23:17 CT — Vercel env: world-agent vars + redeploy
- What: added `APIXIS_WORLD_KEY` (encrypted, prod/preview/dev, 23:16:57) and `APIXIS_WORLD_API` (plain, prod/preview/dev, 23:16:58). Production was then redeployed from the same commit `3f489f0` (`dpl_CE2JqWsw7cNsiyjzN4WT7HyFsY3D`, 23:17). Names only; values were not read.
- Where: Vercel project `spatial-dashboard`.
- Who: Hermes (Geoxis Bot) **[inferred]**. The edits were made through the `313aidaroos` Vercel account 11 minutes before Hermes's provision commits, which read these vars.
- Undo: remove env vars `APIXIS_WORLD_KEY` and `APIXIS_WORLD_API`, then redeploy. This breaks world provisioning, so revert the provision code first.

### 2026-09-29 23:28–23:33 CT — world-agent provision on first signup (direct to main, no PR)
- What: `2bd6638` (23:28) added `api/world/provision.js`, `lib/apixis-world.js`, `src/apixisWorld.js`, the `src/main.js` hook, and an `AI_CHANGELOG.md` entry. `aa5235c` (23:30) added error handling + a `readBody` helper. `794f7d3` (23:33) switched to the Apixis.dev SDK copies (`lib/apixis-world-agent.ts`, `lib/apixis-world-provision.ts`, `lib/apixis-world.ts`, `docs/PROVISION_KIT.md`; `lib/apixis-world.js` removed). All paths are under `spatial-dashboard/`. Prod deploys: `dpl_8UTJu9UsZTGKcRCvGpyA28qza1AZ`, `dpl_ABoBPVj7WEBYwjpH8qmWdgAtkrWT`, `dpl_46w4kQkpjAh5jrNQUZjHiXHtu9DR`.
- Where: main `2bd6638`, `aa5235c`, `794f7d3`. Pushed straight to main with no PR.
- Who: Hermes ("Geoxis Bot (Hermes Agent)"), confirmed by `AI_CHANGELOG.md` (dated 09-30).
- Undo: first revert the later commits that touch these files (`f9be377`, `3953987`, `9f41c33`, `2fdac6f`), then `git revert 794f7d3 aa5235c 2bd6638`.

### 2026-09-30 02:34 CT — PR #9 bill the Apixis ID sub first; OTP type email (Claude)
- What: `lib/apixis-wallet.js` reserve/entitlements/redeem take the Apixis `sub` or the verified email; `api/redeem.js` bills the `sub` first; `lib/apixis-login.js` verifies with type `email`; the world-kit `.ts` copies were re-synced. Prod deploy `dpl_ACTvpZX4iedsxFadxM8hewMaEBGx`.
- Where: PR #9, branch `claude/awesome-newton-3tygzi` (opened 02:27), merged as main `2fdac6f`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 2fdac6f`.

### 2026-09-30 02:56 CT — PR #10 Cixy shared family persona + calm fallback (Claude)
- What: new `lib/apixis-cixy.js` (shared family core); `lib/core.js` prompt now starts from it, with the family greeting rule; on provider failure `api/cixy.js` returns `cixyUnavailableReply()` (503/429). Prod deploy `dpl_FJFMAe5FSVDKmb89ERbpbGTxg3MR`.
- Where: PR #10, same branch, merged as main `b3c445a`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert b3c445a`.

### 2026-09-30 03:27 CT — PR #11 GitHub Actions CI (Claude)
- What: added `.github/workflows/ci.yml` (calls `313aidaroos/github-actions/node-ci`) and adjusted `spatial-dashboard/test/core.test.mjs`. Prod deploy `dpl_3SzWMwuyaNPycWntfHfA8EPRvSNS`. Note: the changelog says a `typecheck` script was added, but the PR's file list has no `package.json` change.
- Where: PR #11, same branch, merged as main `5428a5a`.
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 5428a5a`.

### 2026-09-30 04:11–04:13 CT — provision endpoint rewritten in plain JS (direct to main, no PR)
- What: `3953987` (04:11, "use JS logic instead of TS imports", committer "Awad Alaidaroos") and `f9be377` (04:13, "simplify world provision endpoint logic") both rewrite `spatial-dashboard/api/world/provision.js`. Prod deploys: `dpl_DuKMrzkJm9giiZJdqk3jhssEBdhd`, `dpl_35FNhKTrYoR3FGiQKiLaBPF8rUu9`. **Known issue (10-02 audit):** `/api/world/provision` returns 500 FUNCTION_INVOCATION_FAILED in prod (wrong `../lib` import path, no auth header from the client, wrong config field names, `@supabase/supabase-js` missing from `package.json`).
- Where: main `3953987`, `f9be377`. No PR and no `AI_CHANGELOG.md` entry.
- Who: Hermes **[inferred]**. These follow up Hermes's 09-29 provision commits, and no agent logged them.
- Undo: `git revert f9be377 3953987`.

### 2026-10-01 20:56 CT — PR #12 root `.env.example` (Claude)
- What: added `.env.example` at the repo root, listing every env var the code reads (names only), plus an `AI_CHANGELOG.md` entry. Prod deploy `dpl_cvXMzPWWnU4Zg3urXXhAxMAG9jLm`.
- Where: PR #12, branch `claude/awesome-newton-3tygzi` (opened 20:55), merged as main `57f1465`.
- Who: Claude (Claude Code). Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 57f1465`.

### 2026-10-01 23:10 CT — PR #13 starter in-world Ixis wording 1,000 (Claude)
- What: `spatial-dashboard/lib/apixis-world-agent.ts` comment/wording changed from 200 to 1,000 Ixis (D11), plus an `AI_CHANGELOG.md` entry. Prod deploy `dpl_E4pkiQEXxeuUEC8GgWwr721JX5ne`.
- Where: PR #13, same branch, merged as main `9f41c33` (open to merge took 25 s).
- Who: Claude. Confirmed by `AI_CHANGELOG.md`.
- Undo: `git revert 9f41c33`.

### 2026-10-01 23:18 CT — PR #8 closed unmerged as "superseded" (mass closure)
- What: PR #8 (`geoxis-lead/one-account`) was closed **without merging** at 23:18:39. Closing comment: "Closing: superseded. `main` already has Log in with Apixis ID and the world agent at sign-in (shared kits). The branch is kept." (signed "Generated by Claude Code"). **Only partly true:** main has no "Log in with Apixis ID" label, and main's provision endpoint is broken (see 09-30 04:11).
- Mass closure: family-wide, 51 unmerged PRs were closed between 23:17:36 and 23:20:22 CT on 10-01 (this matches Developer Bot's count of 51). **This repo: 1 (PR #8 only).** PR #7 was not closed.
- Where: PR #8. The branch was not deleted.
- Who: Claude (Claude Code), per the comment signature, acting through the `313aidaroos` account. Developer Bot reported the 51. It is **[inferred]** that Claude ran the whole sweep.
- Undo: reopen PR #8 (needs Awad's decision; not done here).

### 2026-10-02 02:22 CT — PR #14 Apixis Companies page (Codex)
- What: new `spatial-dashboard/public/companies.html` + `companies.css` and 6 images in `public/companies/` (15 illustrated company cards with reduced-motion support); an "Apixis Companies →" nav link in `index.html`. `/companies` is live (200). Prod deploy `dpl_6zWsvKFrPvh9mLU8qM1rXi3vJ1CN`.
- Where: PR #14, branch `codex/apixis-companies-20261002` (opened 01:29), merged as main `32b5ac9`. The branch is still present.
- Who: Codex **[inferred]** from the `codex/` branch prefix. There is **no `AI_CHANGELOG.md` entry** (breaks the repo rule).
- Undo: `git revert 8935e34 be61d32 32b5ac9` (newest first); delete branch `codex/apixis-companies-20261002`.

### 2026-10-02 02:47 CT — PR #15 Companies card motion + copy (Codex)
- What: removed the orbit/spark overlays and the badge bounce; card descriptions and links now match the approved mockup (`public/companies.html`, `companies.css`). Prod deploy `dpl_DfbEuZqqJnpCm18FoW6Ss4Xh8oYp`.
- Where: PR #15, branch `codex/refine-companies-motion-20261002` (opened 02:41), merged as main `be61d32`.
- Who: Codex **[inferred]** (branch prefix). No `AI_CHANGELOG.md` entry.
- Undo: `git revert be61d32` (after reverting `8935e34`); delete the branch.

### 2026-10-02 03:19 CT — PR #16 Recovra link fix (Codex)
- What: the Recovra card now points to `recovra-three.vercel.app` (`recovra.vercel.app` serves a different app) in `public/companies.html`. Prod deploy `dpl_CjemvWTyPmTFA1E46gRR6Q4pqLcp` READY. This is the current production (main HEAD `8935e34`).
- Where: PR #16, branch `codex/fix-recovra-company-link-20261002` (opened 03:16), merged as main `8935e34`.
- Who: Codex **[inferred]** (branch prefix). No `AI_CHANGELOG.md` entry.
- Undo: `git revert 8935e34`; delete the branch.

### 2026-10-02 (this commit) — NOTES backfill
- What: appended this backfill section. Existing content is unchanged. No code, env, DB, PR, branch or deploy was changed (change freeze; this was the one approved narrow task).
- Where: main, `NOTES/GROK.md` only. Commit message `docs(notes): backfill NOTES/GROK.md through 2026-10-02 [notes only]`.
- Who: Geoxis Lead / Grok.
- Undo: `git revert <this commit>` (notes only).

## 2026-10-04 (CT) — Grok: owner admin allowlist (alaidaroosawad@gmail.com, awad@apixis.dev)
- What: Awad's rule — both owner emails are the Geoxis owner/admin as soon as they sign in with a verified email (magic link, password, Apixis ID). How it works: `isOwner(email)` (`spatial-dashboard/lib/core.js`) decides `ctx.admin`, which opens the owner support queue (`/api/admin/support`) and puts the person in the `geoxis-owner` tenant as `owner`; RLS `public.is_admin_user()` reads `public.admin_emails`. `isOwner` was only awad@apixis.dev; now both owner emails + optional `ADMIN_EMAILS` env (comma-separated), case-insensitive. `ensureUserTenant()` now also needs a confirmed email before granting admin. `sql/001_auth_support.sql` seeds both emails into `admin_emails`. Nobody else's access changed. No accounts or passwords were created.
- Where: `spatial-dashboard/lib/core.js`, `spatial-dashboard/lib/supabaseServer.js`, `spatial-dashboard/sql/001_auth_support.sql`, `spatial-dashboard/test/core.test.mjs`; Vercel env `ADMIN_EMAILS` on project `spatial-dashboard` (production + preview).
- Needs Awad: prod `public.admin_emails` still has only awad@apixis.dev (the app uses the service role, so the app side works for both now; only direct RLS reads differ). Run `insert into public.admin_emails (email, role) values ('alaidaroosawad@gmail.com','owner') on conflict (email) do update set role = excluded.role;` in the Geoxis Supabase SQL editor.
- Who: Grok.
- Undo: `git revert <squash SHA>` and delete `ADMIN_EMAILS` in Vercel → spatial-dashboard → Settings → Environment Variables.

## 2026-10-04 (CT) — Grok Bot: Feed tab on Geoxis (PR open, NOT merged)
- Why: Awad asked for the Socixis Social family feed as a Feed tab on every Ixis site. Awad put feed changes on hold, so this PR is for preview review only; do not merge until Awad says so.
- What: new public `/feed` page in Geoxis's own shell (same header, footer, fonts, colors and buttons). For You is the unfiltered mixed feed from every Apixis company with source-site badges and AI labels; Following, Search · Trending and You tabs; video/photo/text posts, like, comment, follow, save, share, report, tips and boosts in Ixis. Signed-out visitors can browse; the 4th tab says "You" and shows a sign-in card (Apixis ID). Text-only posts use the site's body font, wrap long words and size to their content; media posts keep the full-height layout; feed modals sit above everything.
- Where: `spatial-dashboard/public/feed.html` (static page with the globe's own top-bar look: Geoxis brand, Login/Support/Admin, family links; Tailwind config and Special Elite font copied from index.html; "◎" glyph instead of the inline globe SVG), `spatial-dashboard/public/feed.css`, `spatial-dashboard/public/js/feed/feed-app.js` (esbuild bundle of `spatial-dashboard/feed-client/`), `spatial-dashboard/api/feed-session.js` (Geoxis keeps its Supabase token in localStorage, so the page sends it as a Bearer header via the new optional `sessionHeaders` client option), "Feed →" link in `index.html` family nav and in `public/companies.html`.
- Backend: https://www.apixis.dev/api/feed. `/api/feed-session` calls POST /api/feed/session server-side with the existing `APIXIS_WORLD_KEY` + X-Apixis-Client/Sub/Email and returns the short-lived fdt_ token. No new env vars, no DB change, no SVGs.
- Who: Grok Bot (for Awad).
- Undo: close this PR, or `git revert <squash sha>` if it is ever merged.

## 2026-10-04 19:00 (CT) — Grok Bot: Feed phone tab fit (same PR, still NOT merged)
- What: at 375px the 4th "You" tab was pushed off-screen by "Search · Trending". Under 560px the tab now reads "Search", tabs are tighter, and if a wide site font still can't fit the tabs and "+ Post" on one row, Post drops to its own row instead of covering "You". Desktop is unchanged; the site's colors, fonts and buttons are untouched; no SVGs.
- Where: feed client `FeedView.tsx` (tab label) and the shared layout section of the site's feed CSS.
- Who: Grok Bot (for Awad). No merge, no production deploy.
- Undo: revert this commit on the PR branch.
## 2026-10-04 — Owner admin row in prod (Grok)
- What: inserted ('alaidaroosawad@gmail.com','owner') into prod public.admin_emails on Supabase ncifprfgastofurrlsko via the MCP. Both owner emails are now present. Owner bypass check: Geoxis has no product paywalls to skip, since plans are not on sale (api/redeem.js returns not_on_sale) and nothing reads entitlements. No code change.
- Who: Grok.
- Undo: delete from public.admin_emails where email='alaidaroosawad@gmail.com';
## 2026-10-04 catch-up provenance (CT)

The entries below record the day's observed commits and merged PRs. Existing detailed entries above remain the change descriptions; this section supplies exact provenance and undo pointers.

### Commits
- `9a477c6` (2026-10-04T18:14:47-05:00, 313aidaroos; alaidaroosawad@gmail.com) — NOTES: gmail owner row added to prod admin_emails (#18). Undo: undo via the merged PR below: git revert 9a477c6.
- `cd656ff` (2026-10-04T17:47:42-05:00, 313aidaroos; alaidaroosawad@gmail.com) — Owner admin allowlist: both owner emails are Geoxis owner (verified only) (#17). Undo: undo via the merged PR below: git revert cd656ff.

### Merged PRs
- PR #18, merge `9a477c6`, `grok/notes-admin-row` → `main`, merged 2026-10-04 CT by 313aidaroos: NOTES: gmail owner row added to prod admin_emails. Undo: `git revert 9a477c6`.
- PR #17, merge `cd656ff`, `grok/owner-admin-allowlist` → `main`, merged 2026-10-04 CT by 313aidaroos: Owner admin allowlist for alaidaroosawad@gmail.com and awad@apixis.dev. Undo: `git revert cd656ff`.

## 2026-09-29 (CT) — "Other Ixis companies" footer (Geoxis Lead / Grok)
- **What:** Awad-approved footer section linking the other Ixis sites (Geoxis itself left out; Nexxis/Omnixis, Launchixis, PersonalContentBot, AwadBot, COMMAND excluded). Plain text links, `target="_blank" rel="noopener"`, wrap on narrow screens.
- **Files:** `spatial-dashboard/src/ixisCompanies.js` (new: the single list + renderer into `[data-ixis-companies]`); `index.html` (small block at the bottom of the left sidebar, just above the feed-status bar, so nothing covers the map); `login.html`, `support.html`, `admin.html` (minimal `<footer>` at the bottom of the existing card using the page's existing `border-line` / `text-slate-500` / `text-slate-400 hover:text-emerald-300` styles). Each page loads `/src/ixisCompanies.js`.
- **Undo:** revert the PR (or delete `src/ixisCompanies.js`, the four `<footer>…data-ixis-companies…</footer>` blocks and the four `<script src="/src/ixisCompanies.js">` tags).
- **2026-09-29 (CT) update:** removed Nursery Toons and Qahwah World from `src/ixisCompanies.js` (Awad-approved); list is now 11 sites.

## 2026-10-04 (CT) — Grok: PR #7 brought up to date with main
- What: merged main (`cca2d9e`) into `geoxis-lead/ixis-footer` via `gh api` (merge commit, no force-push) and re-applied the footer blocks onto main's current `index.html` / `login.html` / `support.html` / `admin.html`. No content or style change to the footer itself. The globe now has both the Codex "Apixis Companies →" link (to `/companies`, 15 cards) and this footer (11 links); Awad may want only one.
- Who: Grok (Geoxis Lead), hub dispatch 2026-10-04 ~19:00 CT.
- Undo: revert the PR after merge, or close it.

## 2026-10-04 (CT) — Grok: provenance for unlogged items since 2026-10-02
- `dd294cc` (18:24 CT, 313aidaroos, **pushed straight to main, no PR**, during the freeze): "notes: 2026-10-04 catch-up", `NOTES/GROK.md` only. Side effect: it deleted this file's intro line and duplicated the "2026-10-04 summary" heading; repaired by `cca2d9e` below. Who: Grok (catch-up job). Undo: `git revert dd294cc`.
- `cca2d9e` (18:53 CT, 313aidaroos, **pushed straight to main, no PR**, during the freeze): "notes: fix 10-04 catch-up", `NOTES/GROK.md` only; restored the intro line and corrected the Claude line. Who: Grok (catch-up job). Undo: `git revert cca2d9e`.
- PR #20 / `4c09ca2` (18:31 CT, branch `claude/great-fermi-6brq7a`): Claude's full-portfolio review, adds `NOTES/CLAUDE.md` + an `AI_CHANGELOG.md` line. Notes only, no code/env/DB. Who: Claude (Claude Code). Undo: `git revert 4c09ca2`.
- Vercel env `ANTHROPIC_API_KEY` on project `spatial-dashboard` was updated 2026-10-04 12:00 CT by the 313aidaroos account (seen in env metadata; value not read). Status: **unattributed, under hub review**. It looks family-wide (Deduxis and PersonalContentBot saw the same change), but who did it and why is unconfirmed. The key itself was not touched. Undo: none from here; the hub decides after its review.
- Vercel env `ADMIN_EMAILS` created 17:44 CT (production + preview) — already logged under PR #17 above.

## 2026-10-04 (CT) — Grok: claude-review-fixes (branch `geoxis-lead/claude-review-fixes`, one PR, NOT merged/deployed)
- What / where:
  1. `spatial-dashboard/api/world/provision.js`: import `../../lib/supabaseServer.js` (was `../lib/…`, which doesn't exist, so the function crashed on load: live GET/POST = 500 FUNCTION_INVOCATION_FAILED). Metadata save now uses the Supabase Auth admin REST endpoint with `envConfig().url/serviceKey` (it used `@supabase/supabase-js`, which isn't a dependency, and wrong field names). Error body no longer echoes `err.message`.
  2. `spatial-dashboard/src/apixisWorld.js`: sends the session Bearer token (it sent none, so it always got 401); skips the call when signed out.
  3. `spatial-dashboard/lib/core.js`: Cixy model = `process.env.AI_MODEL || "claude-sonnet-5"` (new `cixyModel()`); it was `claude-sonnet-4-20250514`, retired 2026-06-15 — live POST /api/cixy answered 503 "Cixy is resting".
  4. `spatial-dashboard/lib/apixis-cixy.js`: the culture line now reads "Your character draws on Arab culture: warm hospitality, generosity, respect and directness." (changed 2026-10-04 ~19:00 CT on the hub's instruction from "Arab and Muslim culture"). Removed (Halaxis-only): the word "Muslim", religious greetings (Salam / As-salamu alaykum), religious phrases (Insha'Allah / alhamdulillah), halal/religious rules (alcohol/pork/gambling/interest), the religious-ruling line and the "faith" wording. Kept honesty and the Ixis/Wallet rules. This Geoxis copy now differs from the canonical `ApixisWallet/docs/CIXY.md` text.
  5. `spatial-dashboard/test/core.test.mjs`: tests require the Arab culture line and assert that "Muslim"/"Islam", the banned greetings, phrases, rules and rulings are absent. New test for `cixyModel()`.
  6. `spatial-dashboard/docs/PROVISION_KIT.md`: "200 starter Ixis" → 1,000 (granted once on Apixis.dev). `spatial-dashboard/admin.html`: subtitle names both owner emails (text only, same styling).
- Not changed: the owner admin allowlist (already both emails since PR #17; `ADMIN_EMAILS` env holds both), Vercel env/protection, Supabase, Wallet, Stripe. No SVGs were removed: Claude added none since 10-02.
- Who: Grok (Geoxis Lead), at Awad's request via the Developer Bot hub, 2026-10-04 18:43 CT.
- Undo: close the PR without merging; after a merge, `git revert <squash SHA>`.

## 2026-10-04 (CT) — Grok (Geoxis Lead): AI_MODEL env + merge of PR #21
- Who: Geoxis Lead (Grok), on the Developer Bot hub's 18:55 CT order relaying Awad (lifts the freeze for PR #21 and PR #7 only).
- What / where:
  1. Vercel env `AI_MODEL=claude-sonnet-5` (plain) added ~19:13 CT on project `spatial-dashboard` (team `313aidaroos-projects`), targets production + preview, env id `rKc55dZWD1YNEtvC`. `lib/core.js` `cixyModel()` reads it at runtime. No other env var touched; `ANTHROPIC_API_KEY` not read or changed.
  2. PR #21 (`geoxis-lead/claude-review-fixes`) squash-merged to `main` after green checks (ci x2, Vercel); the push to main auto-deploys production.
- Undo: delete env `rKc55dZWD1YNEtvC` in Vercel (code falls back to `claude-sonnet-5`, so also revert if needed); `git revert <PR #21 squash SHA>` (SHA recorded in the PR #7 notes entry).

## 2026-10-04 19:13 (CT) — Grok Bot: Feed PR #19 approved for production by Awad
- Why: Awad said "make it live" at 7:13 PM CT on Oct 4, 2026, approving the squash-merge of this PR and the production deploy that follows from main.
- What: squash-merge of PR #19 (feed files + Feed nav entry only); Vercel's Git integration deploys main to production.
- Who: Grok Bot (for Awad).
- Undo: `git revert <squash sha of PR #19>` on main and push (the squash sha is on the PR page and in /workspace/feed/STATUS.md), or in Vercel promote the previous production deployment (instant rollback) and then revert.
## 2026-10-04 (CT) — Grok (Developer Bot hub): Cixy persona v2 sync + Ominix link
- What: Follow-up to lead PR #21 (merged 14b3481; its provision and model fixes untouched): spatial-dashboard/lib/apixis-cixy.js (JS port) replaced with v2 (core text identical to the TS kit); test expects the v2 Arab-culture line. Ominix link in spatial-dashboard/public/companies.html now https://ominix-app.vercel.app (URL string only).
- Files: spatial-dashboard/lib/apixis-cixy.js spatial-dashboard/public/companies.html spatial-dashboard/test/core.test.mjs 
- Why: Awad's lock — no religious content in Cixy on any product except Halaxis; she declines only genuinely harmful, deceptive or illegal content, never on religious grounds (9/30). Kit = ApixisWallet `sdk/apixis-cixy.*` v2 (3a22244, PR #50) with two hub edits pending canonical: the religion-derived "clean recommendations" rule (gambling) is replaced by "decline only harmful, deceptive or illegal, never on religious grounds", and the character line reads "draws on Arab culture". Ominix links point to https://ominix-app.vercel.app (checked 200 on 2026-10-04 ~6:55 PM CT).
- Who: Grok (Developer Bot hub), branch `grok/cixy-v2-20261004`, one squash-merged PR.
- Undo: `git revert <squash sha of this PR>` (sha recorded in the PR), then redeploy prod.

## 2026-10-04 (CT) — Grok (Geoxis Lead): PR #21 deployed + PR #7 merge
- Who: Geoxis Lead (Grok), Developer Bot hub order 18:55 CT relaying Awad.
- PR #21 squash SHA `14b348166bc6e34a797e376edba810032df5e734` (merged 19:14 CT); production deployment `dpl_aTi5evjQuBD6yCVKLqmB78dt5eeU` READY. Prod smoke: GET /api/world/provision 405, signed-out POST 401 (was 500); POST /api/cixy 200 with a normal English greeting (no religious greeting); /, /login, /support, /admin, /companies 200. Undo: `git revert 14b3481`.
- PR #7 (`geoxis-lead/ixis-footer`): main (`14b3481`, then `03b7d92` after the hub merged PR #23) merged into the branch via the GitHub API (merge commit, no force-push); `NOTES/GROK.md` + `AI_CHANGELOG.md` append conflicts resolved by keeping both sides; `admin.html` auto-merged (footer + both-owner subtitle). Then squash-merged to `main` (prod auto-deploy). Undo: `git revert <PR #7 squash SHA>`.

## 2026-10-04 (CT) — Grok: Apixis ID is the only signup (branch `geoxis-lead/apixis-only-signup`, PR, NOT merged)
- What: magic-link requests now send `create_user: false` / `should_create_user: false` (they sent `true`, so any email could create a local Supabase account). An unknown email gets "No Geoxis account uses this email yet. New here? Use Sign in with Apixis…". One muted hint line under the Apixis button on `/login` (existing `text-slate-500` style, no redesign). Password stays as sign-in for existing accounts; the code has no password signup (login uses `signInWithPassword`, `/set-password` only updates a signed-in user). New accounts come only from the Apixis ID callback (`lib/apixis-login.js`).
- Where: `spatial-dashboard/src/authClient.js`, `spatial-dashboard/login.html`.
- Needs the hub (not done here): Supabase Auth on `ncifprfgastofurrlsko` still allows public signup via `/auth/v1/signup` with the anon key. To fully close it, turn off "Allow new users to sign up" — but first confirm the Apixis callback's admin-API user creation (service role) still works with it off (it should; admin creation bypasses that setting).
- Who: Grok (Geoxis Lead), hub dispatch 2026-10-04 ~19:00 CT.
- Undo: close the PR; after a merge, `git revert <squash SHA>`.


## 2026-10-04 (CT) — Grok (Geoxis Lead): merge of PR #22 + Supabase signup decision
- Who: Geoxis Lead (Grok), Developer Bot hub order 19:19 CT relaying Awad.
- What: PR #22 (`geoxis-lead/apixis-only-signup`) brought up to date with main via the GitHub API (merge commit, no force-push; `login.html` kept both the Apixis-only hint and the "Other Ixis companies" footer; notes appends kept both sides), then squash-merged to `main` (prod auto-deploy).
- Supabase "Allow new users to sign up" on `ncifprfgastofurrlsko` **stays ON** (hub decision, 10/4 19:19 CT). Not changed. So `/auth/v1/signup` with the anon key remains open; the app itself no longer creates users from magic links (`create_user: false`) and has no password signup.
- Undo: `git revert <PR #22 squash SHA>` (recorded in PR #24 / follow-up notes).

## 2026-10-04 (CT) — Grok (Geoxis Lead): after-the-fact record for PR #7
- PR #7 squash SHA `d471ddd050914068d5e7f2e6b25de5d164aa7e07` (merged 19:17 CT); production deployment `dpl_ELY6dUmxSUWuV5pALhSYa8pMhf93` READY. Live check: "Other Ixis companies" present in the HTML of /, /login, /support, /admin. Re-smoke on this deploy: provision GET 405 / POST 401; Cixy "hi" 200; /, /login, /support, /admin, /companies 200.
- Who: Geoxis Lead (Grok). Undo: `git revert d471ddd` (footer); `git revert 14b3481` (#21); delete Vercel env `rKc55dZWD1YNEtvC` (AI_MODEL).

## 2026-10-04 (CT) — Grok (Geoxis Lead): after-the-fact record for PR #22
- PR #22 squash SHA `4e9da19a72d9fcdf3b01852bad4d7ca83af7e368` (merged 19:21 CT); production deployment `dpl_FFnaKREhNFJh8HGQMKtTt6A4a9uK` READY. Smoke: /login 200 with the Apixis-only hint; built JS sends `create_user:false` / `should_create_user:false` (no `true` left; no real email submitted); POST /api/cixy "hi" 200; signed-out POST /api/world/provision 401, GET 405.
- Supabase "Allow new users to sign up" stays ON (hub decision). Main also gained PR #19 (`4c3f8a8`, Socixis feed tab), not by Geoxis Lead.
- Who: Geoxis Lead (Grok). Undo: `git revert 4e9da19`.

## 2026-10-04 (CT) — Grok (Geoxis Lead): footer now lists the full Ixis family
- What / where: `spatial-dashboard/src/ixisCompanies.js` list only (no markup or style change): 11 → 14 sites, same names/URLs/order as Rawixis.dev's footer (`lib/marketing/ixis-companies.ts`) and this site's `/companies` page, minus Geoxis. Added Pinixis, Launchixis, Ominix (`https://ominix-app.vercel.app`); Rawixis kept (Rawixis's own list omits itself). Order changed to match. Nursery Toons and Qahwah World stay out (Awad 9/29; Rawixis's list doesn't include them either). All 14 URLs returned 200 on 10/4 ~19:24 CT; no URL differs between Rawixis's list and `/companies`. Codex's "Apixis Companies →" link to `/companies` is kept alongside the footer.
- Who: Geoxis Lead (Grok), Developer Bot hub order 19:19 CT.
- Undo: `git revert <squash SHA>`.

## 2026-10-04 evening provenance, 6:57 to 9:25 PM (CT)

Recorded by Grok (Developer Bot, notes and status sync at 9:25 PM CT). Every change below already has a detailed entry in this file or in the matching lead note; this section adds the exact commit, PR number, and undo pointer. All commits were pushed under the shared `313aidaroos` GitHub account; the detailed entries say which bot or lead made each one. Text only, no code or settings changed.

- 7:14 PM, PR #21, `14b3481`: Geoxis: claude-review fixes (provision 500, Cixy model, Arab-culture-only Cixy, notes). Undo: `git revert 14b3481` on `main`, then redeploy production.
- 7:16 PM, PR #23, `03b7d92`: Cixy persona v2 sync (no religious content outside Halaxis) + Ominix link to ominix-app.vercel.app. Undo: `git revert 03b7d92` on `main`, then redeploy production.
- 7:17 PM, PR #7, `d471ddd`: Footer: "Other Ixis companies" links. Undo: `git revert d471ddd` on `main`, then redeploy production.
- 7:19 PM, PR #19, `4c3f8a8`: Feed tab: Socixis Social family feed at /feed. Undo: `git revert 4c3f8a8` on `main`, then redeploy production.
- 7:21 PM, PR #22, `4e9da19`: Apixis ID is the only signup (magic link for existing accounts only). Undo: `git revert 4e9da19` on `main`, then redeploy production.
- 7:23 PM, PR #24, `7e698e4`: notes: record PR #7 merge SHA + prod deploy (Geoxis Lead). Undo: `git revert 7e698e4` on `main`, then redeploy production.
- 7:26 PM, PR #25, `c1a7aff`: Footer: full Ixis family list (match Rawixis + /companies). Undo: `git revert c1a7aff` on `main`, then redeploy production.

## 2026-10-04 (CT) — Grok: new accounts only through Apixis ID (branch `grok/apixis-id-only-signup`)
- Approval: Awad said go at 10:00 PM CT, Oct 4 2026 ("every Ixis product must allow NEW account creation only through Apixis ID", the shared Wallet SSO at apixis-wallet.vercel.app/sso/authorize).
- What changed: Re-verify only, no code change. Confirmed after PR #22 (`4e9da19`): magic links send `create_user: false` / `should_create_user: false`; no password signup (login uses `signInWithPassword`, `/set-password` only updates a signed-in user); `/signup` is not a route (404); the only user creation is the Apixis ID callback (`lib/apixis-login.js`, admin users API after Wallet SSO).
- Not changed: Supabase project setting "Allow new users to sign up" stays ON (Apixis SSO callback may create users through it). Theme, layout and styles unchanged. No Wallet, Stripe or Cixy files touched.
- Undo: `git revert <squash sha of this PR>` (the sha is recorded in the PR and in /workspace/apixisid/STATUS.md on the box).

## 2026-10-05 overnight provenance, Oct 4 9:35 PM to Oct 5 12:25 AM (CT)

Recorded by Grok (Developer Bot, notes and status sync at 12:25 AM CT on Oct 5). Each change below either has its own detailed entry earlier in this file (written by whoever made it) or is described here. Commits under the shared `313aidaroos` account were made by the bot or lead named in the detailed entry. Every production deployment for this repo was Ready at the time of this sync. Text only, no code or settings changed.

- Oct 4 10:30 PM, PR #26, `30236d3`: notes: re-verified Apixis ID-only signup (no code change). Undo: nothing to undo in code; edit or delete the note text.

## 2026-10-06 — Grok: per-object pricing and public package tracker

- What: Replaced Small / Medium / Large fleet cards with Awad's locked price. $5 per thing per month (500 Ixis), 3-thing minimum ($15 / 1,500 Ixis), 14-day free trial for 1 thing, map report stays $10 (1,000 Ixis), 200 or more emails awad@apixis.dev. Card pay is wording only. Ixis redeem stays on the Wallet path. The server quotes the SKU first and refuses to charge if the catalog amount is not 500 (per thing), 100 (per extra package), or 1,000 (map report). One Wallet hold per thing, so 4 things is 4 × 500. The same click reuses the same idempotency keys. `POST /api/positions` rejects new things past that cap.
- Package tracker: `/track`. First 3 different packages are free with no account (counted per network address). Each package after that is $1 (100 Ixis). Sign in with Apixis is required only to pay. Paying once unlocks that package until it is delivered. The Wallet key is a hash of the person plus the number, so a refresh does not charge again. Carrier is guessed from the number (USPS, UPS, FedEx, DHL, and several others). Stops are geocoded with Open-Meteo (no key) and drawn on the globe. Ship24 is called only on the server.
- Env Awad needs: `SHIP24_API_KEY` (Ship24 Tracking API). Free tier is 10 shipments a month (first month includes a 100-shipment bonus) and the API is included. Paid starts at $39/month for 1,000 shipments ($0.039 each; extra shipments $0.045). AfterShip's API starts around $70/month with no free API tier. EasyPost tracking is about $0.01–$0.03 per shipment with no free tracking tier. 17TRACK's API starts at $119 prepaid for 5,000 shipments with no free tier. Ship24 is the one with a real free API tier and carrier auto-detect.
- Wallet catalog Awad (or the Wallet lead) must add before a live Ixis charge works: `geoxis.tracking.object` at 500 Ixis with `days: 30`, and `geoxis.track.package` at 100 Ixis (one-time, no days). `geoxis.export.report` is already 1,000. Until those two rows exist, redeem answers that nothing was charged.
- Also paste `spatial-dashboard/sql/005_object_limit_packages.sql` so the free-lookup counter and the $1 unlock stick across restarts. Without it, the free counter is per server instance and the Wallet key still prevents a double charge.
- Monthly wording: each payment covers 30 days. Buying the same count again replaces the previous seats instead of adding them. The Wallet does not re-charge by itself when the month ends.
- Sign-in choice: new accounts are Apixis ID only, so the tracker stays open for 3 free lookups and asks for Apixis sign-in only when someone pays.
- Pages use the current globe header (Special Elite, emerald buttons, surface colors) and the Other Ixis companies footer. Cixy help and a short How it works section are on pricing and the tracker.
- Where: `spatial-dashboard/pricing.html`, `track.html`, `api/redeem.js`, `api/track.js`, `api/positions.js`, `lib/pricing.js`, `lib/carriers.js`, `lib/tracking.js`, `lib/packageKey.js`, `lib/ship24.js`, `lib/geocode.js`, `sql/005_object_limit_packages.sql`, tests under `spatial-dashboard/test/`.
- Undo: revert this branch. Remove `SHIP24_API_KEY` if it was added in Vercel. The two new Wallet SKUs can stay; they are not charged until Geoxis redeems them.
## 2026-10-06 — Pricing locked
- Prices for Geoxis were locked by Awad. See NOTES/PRICING.md.
- The site/code still needs updating to match NOTES/PRICING.md where it does not.

## 2026-10-06 (night, ~12:15 AM CT) — Grok: Geoxis cleanup (Meridian delete, domain, Claude notes)

- Task 1 done: PR #31 "Remove undeployed Meridian prototype", squash `551eaf8b163a445a0b184ebd37bce017c595a5d5`. Deleted only the 7 root prototype files and `spatial-dashboard/src/aiController.js`. Before deleting: Awad's grep found nothing outside the deleted file itself; a repo-wide search found no imports from `spatial-dashboard/` (src, api, lib, test, html); PR #29 does not reference `aiController`. `npm ci && npm test && npm run build` on Node 22: 32/32 tests pass, build green. CI green. Production deployment `dpl_FqkYNuYXGhfcncfa7X7bTaM4v8yi` READY on `551eaf8`. Leftover: `README.md` line 17 still says the root prototype files "can be deleted" (left alone to keep the PR to deletions only). Undo: `git revert 551eaf8`.
- Task 2 stopped (Vercel blocked it): `geoxis.vercel.app` is not in any project or alias in team `313aidaroos-projects` (list_aliases empty, no project named geoxis, deployment lookup 404). `add_project_domain` on `spatial-dashboard` returned 409 `owned-on-other-team`: "Cannot add geoxis.vercel.app since it's already assigned to another project." So the old React GIS app on that host belongs to a project in a different Vercel account/team. Nothing was changed in Vercel, the Wallet, or env vars. Wallet client `geoxis` (project `kzneeksminozmhnqaaun`, `wallet_api_clients` id `df7e0d53-839f-4d50-a5b8-1bc16f456b2f`) read only; current `redirect_uris` = `["https://spatial-dashboard-xi.vercel.app/auth/apixis/callback","https://spatial-dashboard-xi.vercel.app/api/auth/apixis/callback"]` (record this as the undo value if the callback is appended later). `APP_URL` not set. Undo: nothing to undo.
- Task 3 done: PR #32, squash `0a87c78acd2de6247b6cf770f41aa073a1422c62`. Claude's `6de0936` only touched `AI_CHANGELOG.md` and `NOTES/CLAUDE.md`; its branch was based on `a01d681` and conflicted with PR #29's changelog entry, so it was cherry-picked onto main with both entries kept. Claude's branch was not modified. Undo: `git revert 0a87c78`.
- Design check (Awad: "still shows the old design and font"): production `spatial-dashboard` is built from current main (bundle hash matches a local build of main); the live page is "Geoxis — Live globe" in Special Elite, the brand font on main since `efd24f4` (2026-09-17). PR #29 did not touch `src/styles.css` or any font. No Claude commit on main or on any Claude branch contains a redesign; NOTES/CLAUDE.md only lists "decide on the redesign proposal (board image sent 2026-10-06)" as open. The old-looking site is `geoxis.vercel.app`, which is a different app in another Vercel account. Open PR #27 (codex, Tailwind build + style changes) is unmerged.

## 2026-10-14 — Geoxis Lead (Grok): launch polish (branch `geoxis-lead/launch-polish`)
- What: `/api/config` adds `ownerEmails` (both master admins; `ownerEmail` kept for old clients). Draft `terms.html` + `privacy.html` (in theme, `noindex`, marked draft for Awad), added to `vite.config.js` inputs. `public/robots.txt` + `public/sitemap.xml`. Meta description/OG tags on index, pricing, track. README Meridian line fixed.
- Who: Geoxis Lead (Grok). Theme unchanged, no SVGs.
- Undo: revert the PR's squash commit.

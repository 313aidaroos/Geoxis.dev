// Added 2026-09-27 (Grok Bot). "Sign in with Apixis" for Geoxis (plain Vercel functions, Supabase REST).
// Flow: /auth/apixis/start → Wallet /sso/authorize → /auth/apixis/callback → exchangeLoginCode (server,
// WALLET_API_KEY) → this site's own Supabase user for the same verified email (app_metadata.apixis_sub)
// → session token handed to /login via the URL hash (same as the magic link; consumeAuthHash scrubs it).
import { randomBytes } from "node:crypto";
import { apixisLoginUrl, exchangeLoginCode } from "./apixis-wallet.js";
import { envConfig } from "./supabaseServer.js";

const STATE_COOKIE = "apixis_login";

export function siteUrl() {
  return (process.env.APP_URL || "https://geoxis.apixis.dev").replace(/\/$/, "");
}

export function callbackUrl() {
  return process.env.APIXIS_REDIRECT_URI || `${siteUrl()}/auth/apixis/callback`;
}

/** Same rules as the SDK's safeLocalRedirect(). */
export function safeLocalRedirect(raw, fallback = "/") {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(raw)) return fallback;
  try {
    const base = "https://local.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base || url.pathname.startsWith("//")) return fallback;
    let path = url.pathname;
    for (let i = 0; i < 8; i++) {
      if (path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) return fallback;
      const decoded = decodeURIComponent(path);
      if (decoded === path) return url.pathname + url.search + url.hash;
      path = decoded;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function apixisSubOf(user) {
  const sub = user?.app_metadata?.apixis_sub;
  return typeof sub === "string" && sub ? sub : null;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function redirect(res, location, cookie) {
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store");
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.setHeader("Location", location);
  res.end();
}

/** GET /auth/apixis/start?next=/path */
export function startApixisLogin(req, res) {
  const url = new URL(req.url, "https://local.invalid");
  const next = safeLocalRedirect(url.searchParams.get("next"));
  const state = randomBytes(24).toString("base64url");
  const value = encodeURIComponent(JSON.stringify({ state, next }));
  redirect(res, apixisLoginUrl({ state, redirectUri: callbackUrl() }), `${STATE_COOKIE}=${value}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
}

/** GET /auth/apixis/callback?code=…&state=… */
export async function finishApixisLogin(req, res) {
  const clear = `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
  const url = new URL(req.url, "https://local.invalid");
  const fail = (reason) => redirect(res, `${siteUrl()}/login?error=${encodeURIComponent(reason)}`, clear);
  let saved = {};
  try { saved = JSON.parse(readCookie(req, STATE_COOKIE) || "{}"); } catch { saved = {}; }

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error"));
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return fail("login_expired");

  let identity;
  try {
    identity = await exchangeLoginCode(code, callbackUrl());
  } catch {
    return fail("apixis_unavailable");
  }
  if (!identity?.email || !identity?.sub) return fail("apixis_unavailable");

  const cfg = envConfig();
  if (!cfg.url || !cfg.anonKey || !cfg.serviceKey) return fail("auth_not_configured");
  const admin = { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json" };
  const email = String(identity.email).toLowerCase().trim();

  try {
    const created = await fetch(`${cfg.url}/auth/v1/admin/users`, {
      method: "POST", headers: admin,
      body: JSON.stringify({ email, email_confirm: true, app_metadata: { apixis_sub: identity.sub } }),
    });
    if (!created.ok) {
      const err = await created.json().catch(() => ({}));
      const msg = `${err.msg || ""} ${err.message || ""} ${err.error_code || ""} ${err.code || ""}`;
      if (!/already|registered|exists/i.test(msg)) return fail("account_error");
    }

    const linkRes = await fetch(`${cfg.url}/auth/v1/admin/generate_link`, {
      method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }),
    });
    const link = await linkRes.json().catch(() => ({}));
    const tokenHash = link.hashed_token || link.properties?.hashed_token;
    if (!linkRes.ok || !tokenHash) return fail("account_error");
    const meta = link.app_metadata || link.user?.app_metadata || {};
    const userId = link.id || link.user?.id;
    if (userId && meta.apixis_sub !== identity.sub) {
      await fetch(`${cfg.url}/auth/v1/admin/users/${userId}`, {
        method: "PUT", headers: admin, body: JSON.stringify({ app_metadata: { ...meta, apixis_sub: identity.sub } }),
      });
    }

    const verify = await fetch(`${cfg.url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", token_hash: tokenHash }),
    });
    const session = await verify.json().catch(() => ({}));
    if (!verify.ok || !session.access_token) return fail("session_error");

    const next = safeLocalRedirect(saved.next || "/");
    const hash = new URLSearchParams({ access_token: session.access_token, expires_in: String(session.expires_in || 3600), type: "apixis" });
    return redirect(res, `${siteUrl()}/login?next=${encodeURIComponent(next)}#${hash.toString()}`, clear);
  } catch {
    return fail("account_error");
  }
}

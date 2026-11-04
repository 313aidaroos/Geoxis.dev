export const TOKEN_KEY = "geoxis.session.access_token";
export const USER_KEY = "geoxis.session.user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function clearSession() {
  setToken("");
  localStorage.removeItem(USER_KEY);
}

export function consumeAuthHash(hash = window.location.hash) {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(text);
  const token = params.get("access_token");
  if (!token) return "";
  setToken(token);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export async function config() {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new Error("config_failed");
  return res.json();
}

// 2026-10-04 (Grok, apixis-only-signup): Apixis ID is the only way to create a Geoxis account.
// Magic links are for existing accounts only (create_user / should_create_user = false).
export const NO_ACCOUNT_MESSAGE = "No Geoxis account uses this email yet. New here? Use Sign in with Apixis to create your Apixis ID.";

export async function requestMagicLink(email, next = "/") {
  const cfg = await config();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("auth_not_configured");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  // auth/callback.html is in the Vite build since 2026-10-06 (it 404ed before). The .html URL is kept so the
  // Supabase redirect allowlist needs no change; Vercel cleanUrls 308s it to /auth/callback with query + hash intact.
  const redirectTo = `${location.origin}/auth/callback.html?next=${encodeURIComponent(safeNext)}`;
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      create_user: false,
      should_create_user: false,
      email_redirect_to: redirectTo,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const text = `${body.error_code || ""} ${body.code || ""} ${body.msg || ""} ${body.message || ""} ${body.error_description || ""}`;
    if (/otp_disabled|signup|not.?allowed|not.?found|user_not_found/i.test(text)) throw new Error(NO_ACCOUNT_MESSAGE);
    throw new Error("magic_link_failed");
  }
  return true;
}

export async function loadMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch("/api/me", { headers: authHeader(), cache: "no-store" });
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) throw new Error("me_failed");
  const me = await res.json();
  localStorage.setItem(USER_KEY, JSON.stringify(me));
  return me;
}

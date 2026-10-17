// Private product adapter for Apixis Orbit: verified Apixis ID subject -> linked Geoxis user -> tenant assets.
// This endpoint never calls the public /api/assets demo fallback and never trusts a browser-supplied tenant.
import { getUserFromBearer, listTenantAssets, selectMany, sendJson } from "../../lib/supabaseServer.js";
import { normalizeEmail } from "../../lib/core.js";
import { pickOrbitAssetSummary, verifyOrbitRequest } from "../../lib/orbit.js";
import { rateLimited } from "../../lib/rateLimit.js";

async function readBody(req) {
  if (typeof req.body === "object" && req.body && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = []; let total = 0;
  for await (const c of req) {
    total += c.length; if (total > 4096) throw new Error("payload_too_large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export async function linkedOrbitTenant(principal) {
  // Exact email match finds only the Geoxis profile that the user authenticated with.
  // The Admin user record must *also* carry the verified Wallet Apixis ID subject.
  const email = normalizeEmail(principal.email);
  if (!email) return null;
  const profiles = await selectMany("profiles", `email=eq.${encodeURIComponent(email)}&select=user_id,email&limit=5`);
  for (const profile of profiles) {
    if (!profile.user_id || normalizeEmail(profile.email) !== email) continue;
    const user = await getUserById(profile.user_id);
    if (!user?.email_confirmed_at || normalizeEmail(user.email) !== email || user.app_metadata?.apixis_sub !== principal.sub) continue;
    const memberships = await selectMany("tenant_memberships", `user_id=eq.${encodeURIComponent(profile.user_id)}&select=tenant_id&limit=10`);
    if (!memberships.length) return null;
    return [...new Set(memberships.map(m => m.tenant_id).filter(Boolean))];
  }
  return null;
}

async function getUserById(id) {
  // Calls the service-role Supabase Admin API for the existing user's verified SSO link.
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) { const e = new Error("supabase_not_configured"); e.status = 503; throw e; }
  const res = await fetch(`${base.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(7000)
  });
  if (!res.ok) { const e = new Error("identity_lookup_unavailable"); e.status = 503; throw e; }
  return res.json();
}

export default async function handler(req, res) {
  const headers = { "Cache-Control": "no-store", "Vary": "x-orbit-signature" };
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" }, { ...headers, Allow: "POST" });
  let body;
  try { body = await readBody(req); }
  catch { return sendJson(res, 400, { error: "invalid_body" }, headers); }
  const verification = verifyOrbitRequest(req, body);
  if (!verification.ok) return sendJson(res, verification.status, { error: verification.error }, headers);
  if (rateLimited(`orbit:${verification.principal.sub}`, 40, 60_000)) return sendJson(res, 429, { error: "rate_limited" }, headers);
  try {
    const tenantIds = await linkedOrbitTenant(verification.principal);
    if (!tenantIds) return sendJson(res, 403, { error: "geoxis_account_not_linked", hint: "Sign in to Geoxis using Apixis ID and retry." }, headers);
    const batches = await Promise.all(tenantIds.slice(0, 10).map(id => listTenantAssets(id)));
    const { assets, totalMatching, truncated } = pickOrbitAssetSummary(batches.flat(), verification.assetId);
    return sendJson(res, 200, {
      version: "orbit-adapter-v1", capability: "geoxis.asset.read", source: "Geoxis", demo: false,
      sourceRecordedAt: assets.length ? assets.map(a => a.recordedAt).filter(Boolean).sort().at(-1) || null : null,
      summary: verification.assetId
        ? (totalMatching ? `Asset ${verification.assetId} found in your Geoxis account.` : "No matching tracked asset in your Geoxis account.")
        : `Found ${totalMatching} tracked asset(s) for your linked Geoxis account.`,
      data: { assets, totalMatching, truncated }
    }, headers);
  } catch (error) {
    console.error("Orbit Geoxis asset read failed:", error.message);
    return sendJson(res, error.status === 503 ? 503 : 502, { error: "geoxis_read_unavailable" }, headers);
  }
}

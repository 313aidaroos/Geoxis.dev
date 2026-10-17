// GET /api/plan → the signed-in tenant's tracking plan: how many things it may follow, how many it
// does, trial state, active keys. Session Bearer token, like /api/me. Read-only.
import { authContext, selectMany, sendJson } from "../lib/supabaseServer.js";
import { activeObjectLimit, PRODUCT_TRIAL, PRODUCT_OBJECT, MIN_OBJECTS, OBJECT_PRICE_USD, OBJECT_PRICE_IXIS, TRIAL_DAYS } from "../lib/pricing.js";

export default async function handler(req, res) {
  const headers = { "Cache-Control": "private, no-store" };
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, headers);
  try {
    const ctx = await authContext(req).catch(() => null);
    if (!ctx) return sendJson(res, 401, { error: "not_authenticated" }, headers);
    const tenant = encodeURIComponent(ctx.tenant.id);
    let rows = [];
    try {
      rows = await selectMany("entitlements", `tenant_id=eq.${tenant}&select=product_key,object_limit,expires_at,status,created_at&order=created_at.desc&limit=500`);
    } catch (err) {
      if (!/object_limit/i.test(String(err?.message || err))) throw err;
      rows = await selectMany("entitlements", `tenant_id=eq.${tenant}&select=product_key,expires_at,status,created_at&order=created_at.desc&limit=500`);
    }
    const [assets, keys] = await Promise.all([
      selectMany("tracked_assets", `tenant_id=eq.${tenant}&select=id&limit=10000`),
      selectMany("ingest_keys", `tenant_id=eq.${tenant}&revoked_at=is.null&select=id`),
    ]);
    const now = Date.now();
    const limit = activeObjectLimit(rows, now);
    const active = rows.filter((r) => r.status === "active" && (!r.expires_at || Date.parse(r.expires_at) > now));
    const trial = rows.find((r) => r.product_key === PRODUCT_TRIAL) || null;
    const nextExpiry = active.map((r) => r.expires_at).filter(Boolean).sort()[0] || null;
    return sendJson(res, 200, {
      tenant: ctx.tenant,
      admin: ctx.admin,
      objectLimit: limit,
      objectsUsed: assets.length,
      activeKeys: keys.length,
      paidSeats: active.filter((r) => r.product_key === PRODUCT_OBJECT).length,
      trial: trial ? { used: true, active: active.includes(trial), expiresAt: trial.expires_at } : { used: false, active: false, expiresAt: null, days: TRIAL_DAYS },
      renewsAt: nextExpiry,
      pricing: { usdPerObject: OBJECT_PRICE_USD, ixisPerObject: OBJECT_PRICE_IXIS, minObjects: MIN_OBJECTS },
    }, headers);
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "plan_failed", message: String(err?.message || err) }, headers);
  }
}

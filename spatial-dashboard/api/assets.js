// Change note (Claude, Oct 2026): signed-in tenants get their own rows (fed by POST /api/positions).
// A tenant with no rows yet gets the public demo fleet flagged `demo: true`, so the globe can say so.
import { snapshot } from "../lib/fleetEngine.js";
import { authContext, listTenantAssets, sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.end();
    return;
  }
  if (req.method && req.method !== "GET") {
    return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  }

  try {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (auth) {
      const ctx = await authContext(req);
      if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });
      const assets = await listTenantAssets(ctx.tenant.id);
      if (assets.length) {
        return sendJson(res, 200, {
          sentAt: Date.now(),
          tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
          sources: { tenant: "supabase" },
          demo: false,
          assets,
        }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
      }
      const demo = await snapshot();
      return sendJson(res, 200, {
        ...demo,
        tenant: { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name },
        sources: { ...demo.sources, tenant: "empty" },
        demo: true,
      }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    }

    const body = await snapshot();
    return sendJson(res, 200, { ...body, demo: true }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "assets_failed", message: String(err?.message || err) });
  }
}

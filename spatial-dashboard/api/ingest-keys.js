// Change note (Claude, Oct 2026): per-tenant ingest keys for POST /api/positions. Session Bearer token
// (same as /api/me). Any member of the tenant can manage the tenant's keys.
//   GET    /api/ingest-keys            → { keys: [{ id, label, key_prefix, created_at, last_used_at, revoked_at }] }
//   POST   /api/ingest-keys { label? } → 201 { key: "gxk_…", id, label, key_prefix }   (the plain key is shown ONCE)
//   DELETE /api/ingest-keys { id }     → { ok: true }   (revokes; rows are kept for the audit trail)
import { mintIngestKey } from "../lib/ingest.js";
import { authContext, insertOne, patchWhere, selectMany, sendJson } from "../lib/supabaseServer.js";

const MAX_ACTIVE_KEYS = 10;

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const ctx = await authContext(req).catch(() => null);
    if (!ctx) return sendJson(res, 401, { error: "not_authenticated" }, headers);
    const tenant = encodeURIComponent(ctx.tenant.id);

    if (req.method === "GET") {
      const keys = await selectMany(
        "ingest_keys",
        `tenant_id=eq.${tenant}&select=id,label,key_prefix,created_at,last_used_at,revoked_at&order=created_at.desc`,
      );
      return sendJson(res, 200, { tenant: ctx.tenant, keys }, headers);
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const label = String(body.label ?? "default").trim().slice(0, 60) || "default";
      const active = await selectMany("ingest_keys", `tenant_id=eq.${tenant}&revoked_at=is.null&select=id`);
      if (active.length >= MAX_ACTIVE_KEYS) return sendJson(res, 409, { error: "too_many_keys", max: MAX_ACTIVE_KEYS }, headers);
      const minted = mintIngestKey();
      const row = await insertOne("ingest_keys", {
        tenant_id: ctx.tenant.id,
        created_by: ctx.user.id,
        label,
        key_prefix: minted.prefix,
        key_hash: minted.hash,
      });
      return sendJson(res, 201, { id: row.id, label: row.label, key_prefix: row.key_prefix, key: minted.key }, headers);
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      const id = String(body.id || "");
      if (!id) return sendJson(res, 400, { error: "missing_id" }, headers);
      const rows = await patchWhere(
        "ingest_keys",
        `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${tenant}&revoked_at=is.null`,
        { revoked_at: new Date().toISOString() },
      );
      if (!rows.length) return sendJson(res, 404, { error: "key_not_found" }, headers);
      return sendJson(res, 200, { ok: true }, headers);
    }

    return sendJson(res, 405, { error: "method_not_allowed" }, headers);
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "ingest_keys_failed", message: String(err?.message || err) }, headers);
  }
}

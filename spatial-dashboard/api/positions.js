// Change note (Claude, Oct 2026): the real fleet ingest path. Before this, nothing wrote to
// tracked_assets / asset_positions, so every signed-in tenant saw the Rotterdam demo fleet.
//
// POST /api/positions      Authorization: Bearer gxk_…   (a tenant ingest key, see /api/ingest-keys)
// Body: { positions: [{ id, name?, type?, latitude, longitude, altitudeMeters?, heading?, speedMps?,
//         destination?, cargo?, alarm?, alarmReason?, recordedAt? }] }   or one position, or a bare array.
// 202 { accepted, rejected: [{ index, error }] }   → the globe shows them on its next poll (2 s).
// Contract and examples: docs/INGEST.md
import { hashIngestKey, looksLikeIngestKey, validatePositionsBody } from "../lib/ingest.js";
import { bearerToken } from "../lib/core.js";
import { insertMany, patchWhere, selectMany, sendJson, upsertMany } from "../lib/supabaseServer.js";
import { clientIp, rateLimited } from "../lib/rateLimit.js";
import { activeObjectLimit, splitByObjectLimit } from "../lib/pricing.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) {
      const err = new Error("payload_too_large");
      err.status = 413;
      throw err;
    }
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

/** Resolve a gxk_ key to its tenant; null when unknown or revoked. */
export async function tenantForIngestKey(key) {
  if (!looksLikeIngestKey(key)) return null;
  const rows = await selectMany(
    "ingest_keys",
    `key_hash=eq.${encodeURIComponent(hashIngestKey(key))}&revoked_at=is.null&select=id,tenant_id&limit=1`,
  );
  return rows[0] ?? null;
}

export default async function handler(req, res) {
  const cors = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.end();
    return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

  const key = bearerToken(req);
  if (!looksLikeIngestKey(key)) return sendJson(res, 401, { error: "ingest_key_required", hint: "Authorization: Bearer gxk_…" }, cors);
  // Per key, per instance: a speed bump, not a quota (lib/rateLimit.js).
  if (rateLimited(`positions:${hashIngestKey(key).slice(0, 16)}:${clientIp(req)}`, 600, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: "rate_limited" }, cors);
  }

  try {
    const auth = await tenantForIngestKey(key);
    if (!auth) return sendJson(res, 401, { error: "invalid_ingest_key" }, cors);

    const body = await readBody(req);
    const v = validatePositionsBody(body);
    if (!v.ok) return sendJson(res, v.status, { error: v.error, max: v.max, rejected: v.rejected }, cors);

    // Last write per asset wins inside one batch.
    const byId = new Map();
    for (const p of v.positions) byId.set(p.external_id, p);
    let positions = [...byId.values()];

    // Object cap: trial is 1, a paid plan is one seat per captured object (500 Ixis each).
    let objectLimit = 0;
    let existingIds = [];
    try {
      const tenantFilter = `tenant_id=eq.${encodeURIComponent(auth.tenant_id)}`;
      let ents;
      try {
        ents = await selectMany("entitlements", `${tenantFilter}&select=product_key,object_limit,expires_at,status&limit=500`);
      } catch (err) {
        if (!/object_limit/i.test(String(err?.message || err))) throw err;
        ents = await selectMany("entitlements", `${tenantFilter}&select=product_key,expires_at,status&limit=500`);
      }
      objectLimit = activeObjectLimit(ents);
      const assets = await selectMany(
        "tracked_assets",
        `tenant_id=eq.${encodeURIComponent(auth.tenant_id)}&select=external_id&limit=10000`,
      );
      existingIds = assets.map((row) => row.external_id);
    } catch (err) {
      return sendJson(res, 503, { error: "object_limit_unavailable", message: "Could not check how many things this account can follow." }, cors);
    }
    const gate = splitByObjectLimit({
      limit: objectLimit,
      existingIds,
      incomingIds: positions.map((p) => p.external_id),
    });
    const allowed = new Set(gate.allowedIds);
    const limitedOut = positions.filter((p) => !allowed.has(p.external_id)).map((p) => ({ id: p.external_id, error: "object_limit" }));
    positions = positions.filter((p) => allowed.has(p.external_id));
    if (!positions.length) {
      return sendJson(res, 402, {
        error: "object_limit",
        limit: objectLimit,
        rejected: [...(v.rejected || []), ...limitedOut],
        message: objectLimit
          ? `This account can follow ${objectLimit} things. Raise the plan to follow more.`
          : "This account has no tracking plan. Start the 14-day trial or buy a plan. Each thing is $5 a month.",
      }, cors);
    }

    const assets = await upsertMany(
      "tracked_assets",
      positions.map((p) => ({
        tenant_id: auth.tenant_id,
        external_id: p.external_id,
        name: p.name,
        type: p.type,
        operator: p.operator,
        destination: p.destination,
        cargo: p.cargo,
      })),
      "tenant_id,external_id",
    );
    const assetId = new Map(assets.map((a) => [a.external_id, a.id]));
    const now = new Date().toISOString();
    const rows = positions
      .filter((p) => assetId.has(p.external_id))
      .map((p) => ({
        tenant_id: auth.tenant_id,
        asset_id: assetId.get(p.external_id),
        latitude: p.latitude,
        longitude: p.longitude,
        altitude_meters: p.altitude_meters,
        heading: p.heading,
        speed_mps: p.speed_mps,
        alarm: p.alarm,
        alarm_reason: p.alarm_reason,
        recorded_at: p.recorded_at || now,
      }));
    await insertMany("asset_positions", rows);
    patchWhere("ingest_keys", `id=eq.${encodeURIComponent(auth.id)}`, { last_used_at: now }).catch(() => {});

    return sendJson(res, 202, {
      accepted: rows.length,
      rejected: [...(v.rejected || []), ...limitedOut],
      objectLimit,
      tenant_id: auth.tenant_id,
    }, cors);
  } catch (err) {
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: "invalid_json" }, cors);
    return sendJson(res, err.status || 500, { error: "ingest_failed", message: String(err?.message || err) }, cors);
  }
}

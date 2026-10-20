// Server-to-server read-only Orbit request verification.
// No browser token, no admin user selection, no writes. Keep this separate from ingest authentication.
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AGE_MS = 90_000;
const KEY = "ORBIT_GEOXIS_SHARED_SECRET";

export function verifyOrbitRequest(req, body, now = Date.now()) {
  const secret = process.env[KEY] || "";
  if (secret.length < 32) return { ok: false, status: 503, error: "orbit_not_configured" };
  const h = req.headers || {};
  const ts = String(h["x-orbit-timestamp"] || "");
  const sig = String(h["x-orbit-signature"] || "");
  if (!/^\d{13}$/.test(ts) || Math.abs(now - Number(ts)) > MAX_AGE_MS) return { ok: false, status: 401, error: "orbit_expired" };
  if (!/^v1=[a-f0-9]{64}$/.test(sig)) return { ok: false, status: 401, error: "orbit_bad_signature" };
  const canonical = JSON.stringify(body);
  const expected = "v1=" + createHmac("sha256", secret).update(ts + "\n" + canonical).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, status: 401, error: "orbit_bad_signature" };
  const sub = body?.principal?.sub;
  const email = body?.principal?.email;
  if (body?.capability !== "geoxis.asset.read" || typeof sub !== "string" || sub.length < 8 || sub.length > 160
      || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || (body.assetId !== undefined && (typeof body.assetId !== "string" || !/^[a-zA-Z0-9_.:\- ]{1,90}$/.test(body.assetId)))) {
    return { ok: false, status: 400, error: "invalid_orbit_payload" };
  }
  return { ok: true, principal: { sub, email: email.toLowerCase() }, assetId: body.assetId || null };
}

export function pickOrbitAssetSummary(assets, assetId, now = Date.now()) {
  const selected = assetId ? assets.filter(a => a.id === assetId) : assets.slice(0, 20);
  const result = selected.map(a => {
    const recordedAt = typeof a.timestamp === "string" ? a.timestamp : null;
    const recordedMs = recordedAt ? Date.parse(recordedAt) : NaN;
    const stale = !Number.isFinite(recordedMs) || recordedMs > now + 60_000 || now - recordedMs > 30 * 60_000;
    return {
      id: String(a.id), name: String(a.name || a.id).slice(0, 100), type: String(a.type || "other").slice(0, 40),
      latitude: Number(a.latitude), longitude: Number(a.longitude),
      speedKph: Number(a.speedKph || 0), alarm: Boolean(a.alarm),
      alarmReason: a.alarm ? String(a.alarmReason || "Alert reported").slice(0, 200) : null,
      recordedAt, stale
    };
  }).filter(a => Number.isFinite(a.latitude) && Number.isFinite(a.longitude));
  return { assets: result, totalMatching: assetId ? result.length : assets.length, truncated: !assetId && assets.length > 20 };
}

// Change note (Claude, Oct 2026): pure helpers for the fleet ingest path (POST /api/positions) and
// per-tenant ingest keys. No network here so node:test covers them. See docs/INGEST.md.
import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "gxk_";
export const MAX_POSITIONS_PER_POST = 500;
export const ASSET_TYPES = new Set(["vessel", "truck", "drone", "aircraft", "train", "container", "person", "other"]);

/** Mint a new ingest key. Returns the plain key (show once) plus what we store. */
export function mintIngestKey(bytes = randomBytes(32)) {
  const key = KEY_PREFIX + Buffer.from(bytes).toString("base64url");
  return { key, hash: hashIngestKey(key), prefix: key.slice(0, KEY_PREFIX.length + 8) };
}

export function hashIngestKey(key) {
  return createHash("sha256").update(String(key || "")).digest("hex");
}

export function looksLikeIngestKey(value) {
  return typeof value === "string" && value.startsWith(KEY_PREFIX) && value.length >= 30 && value.length <= 120;
}

const num = (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** One position from a device or script. Returns { ok, position } or { ok:false, error }. */
export function validatePosition(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "position_must_be_object" };
  const id = text(input.id ?? input.external_id ?? input.externalId, 120);
  if (!id) return { ok: false, error: "missing_id" };
  const latitude = num(input.latitude ?? input.lat);
  const longitude = num(input.longitude ?? input.lon ?? input.lng);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return { ok: false, error: "invalid_latitude" };
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return { ok: false, error: "invalid_longitude" };
  const rawType = text(input.type, 40)?.toLowerCase() || "other";
  const type = ASSET_TYPES.has(rawType) ? rawType : "other";
  const altitude = num(input.altitudeMeters ?? input.altitude_meters ?? input.altitude);
  const heading = num(input.heading ?? input.course);
  const speed = num(input.speedMps ?? input.speed_mps);
  const speedKph = num(input.speedKph ?? input.speed_kph);
  const speedMps = Number.isFinite(speed) ? speed : Number.isFinite(speedKph) ? speedKph / 3.6 : 0;
  let recordedAt = null;
  if (input.recordedAt ?? input.recorded_at ?? input.timestamp) {
    const t = Date.parse(String(input.recordedAt ?? input.recorded_at ?? input.timestamp));
    if (!Number.isFinite(t)) return { ok: false, error: "invalid_timestamp" };
    recordedAt = new Date(t).toISOString();
  }
  const alarmReason = text(input.alarmReason ?? input.alarm_reason, 200);
  return {
    ok: true,
    position: {
      external_id: id,
      name: text(input.name, 120) || id,
      type,
      operator: text(input.operator, 120),
      destination: text(input.destination, 200),
      cargo: text(input.cargo, 200),
      latitude: +latitude.toFixed(6),
      longitude: +longitude.toFixed(6),
      altitude_meters: Number.isFinite(altitude) ? altitude : 0,
      heading: Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0,
      speed_mps: Math.max(0, speedMps),
      alarm: Boolean(input.alarm) || Boolean(alarmReason),
      alarm_reason: alarmReason,
      recorded_at: recordedAt,
    },
  };
}

/** Body of POST /api/positions: one position, or { positions: [...] } (max 500). */
export function validatePositionsBody(body) {
  const list = Array.isArray(body?.positions) ? body.positions : Array.isArray(body) ? body : body ? [body] : [];
  if (!list.length) return { ok: false, status: 400, error: "no_positions" };
  if (list.length > MAX_POSITIONS_PER_POST) return { ok: false, status: 413, error: "too_many_positions", max: MAX_POSITIONS_PER_POST };
  const positions = [];
  const rejected = [];
  list.forEach((item, index) => {
    const r = validatePosition(item);
    if (r.ok) positions.push(r.position);
    else rejected.push({ index, error: r.error });
  });
  if (!positions.length) return { ok: false, status: 400, error: "all_positions_invalid", rejected };
  return { ok: true, positions, rejected };
}

/** Paid tracking lasts 30 days. The free trial lasts 14 days. One-off products never expire. */
export function entitlementExpiry(productKey, now = Date.now()) {
  const key = String(productKey || "");
  if (key === "geoxis.tracking.trial") return new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
  if (key.startsWith("geoxis.tracking.")) return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mintIngestKey,
  hashIngestKey,
  looksLikeIngestKey,
  validatePosition,
  validatePositionsBody,
  entitlementExpiry,
  MAX_POSITIONS_PER_POST,
} from "../lib/ingest.js";

test("ingest key: gxk_ prefix, sha256 stored, plain key recognised", () => {
  const k = mintIngestKey();
  assert.match(k.key, /^gxk_[A-Za-z0-9_-]{40,}$/);
  assert.equal(k.hash, hashIngestKey(k.key));
  assert.equal(k.hash.length, 64);
  assert.equal(k.prefix, k.key.slice(0, 12));
  assert.equal(looksLikeIngestKey(k.key), true);
  assert.equal(looksLikeIngestKey("eyJhbGciOi.supabase.jwt"), false);
  assert.equal(looksLikeIngestKey("gxk_short"), false);
  assert.notEqual(mintIngestKey().key, k.key);
});

test("position: aliases accepted, numbers normalised", () => {
  const r = validatePosition({ id: "TRUCK-12", lat: "51.92", lng: "4.47", heading: -90, speedKph: 36, type: "Truck", alarmReason: "Late" });
  assert.equal(r.ok, true);
  assert.equal(r.position.external_id, "TRUCK-12");
  assert.equal(r.position.name, "TRUCK-12");
  assert.equal(r.position.type, "truck");
  assert.equal(r.position.latitude, 51.92);
  assert.equal(r.position.longitude, 4.47);
  assert.equal(r.position.heading, 270);
  assert.equal(r.position.speed_mps, 10);
  assert.equal(r.position.alarm, true);
  assert.equal(r.position.recorded_at, null);
});

test("position: rejects missing id, bad coordinates, bad timestamp; unknown type → other", () => {
  assert.equal(validatePosition({ latitude: 1, longitude: 2 }).error, "missing_id");
  assert.equal(validatePosition({ id: "a", latitude: 91, longitude: 2 }).error, "invalid_latitude");
  assert.equal(validatePosition({ id: "a", latitude: 1, longitude: -181 }).error, "invalid_longitude");
  assert.equal(validatePosition({ id: "a", latitude: 1, longitude: 2, recordedAt: "yesterday" }).error, "invalid_timestamp");
  assert.equal(validatePosition("nope").ok, false);
  assert.equal(validatePosition({ id: "a", latitude: 1, longitude: 2, type: "spaceship" }).position.type, "other");
  const ts = validatePosition({ id: "a", latitude: 1, longitude: 2, timestamp: "2026-10-06T08:00:00Z" });
  assert.equal(ts.position.recorded_at, "2026-10-06T08:00:00.000Z");
});

test("positions body: single, array, wrapped; partial rejects; limits", () => {
  const one = validatePositionsBody({ id: "a", latitude: 1, longitude: 2 });
  assert.equal(one.ok, true);
  assert.equal(one.positions.length, 1);
  const arr = validatePositionsBody([{ id: "a", latitude: 1, longitude: 2 }, { id: "b", latitude: 99, longitude: 2 }]);
  assert.equal(arr.ok, true);
  assert.equal(arr.positions.length, 1);
  assert.deepEqual(arr.rejected, [{ index: 1, error: "invalid_latitude" }]);
  assert.equal(validatePositionsBody({ positions: [] }).error, "no_positions");
  assert.equal(validatePositionsBody(null).error, "no_positions");
  assert.equal(validatePositionsBody({ positions: [{ id: "a" }] }).error, "all_positions_invalid");
  const big = { positions: Array.from({ length: MAX_POSITIONS_PER_POST + 1 }, (_, i) => ({ id: String(i), latitude: 1, longitude: 2 })) };
  const r = validatePositionsBody(big);
  assert.equal(r.status, 413);
  assert.equal(r.error, "too_many_positions");
});

test("entitlement expiry: tracking seats 30 days (D2), trial 14 days, one-off report never", () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  assert.equal(entitlementExpiry("geoxis.tracking.small", now), "2026-11-05T00:00:00.000Z");
  assert.equal(entitlementExpiry("geoxis.tracking.object", now), "2026-11-05T00:00:00.000Z");
  assert.equal(entitlementExpiry("geoxis.tracking.trial", now), "2026-10-20T00:00:00.000Z");
  assert.equal(entitlementExpiry("geoxis.export.report", now), null);
});

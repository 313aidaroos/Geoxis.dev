// Pure spherical-earth math shared by the server (fleetEngine) and the browser (dead reckoning,
// route arcs). No Node built-ins, no network. Distances in meters, angles in degrees.

export const EARTH_RADIUS_M = 6_371_000;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Point reached from (lat, lon) travelling `distanceM` along `bearingDeg`. */
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);
  return { latitude: toDeg(φ2), longitude: ((toDeg(λ2) + 540) % 360) - 180 };
}

/** Initial bearing from A to B, 0..360. */
export function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance in meters (haversine). */
export function distanceBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Smallest signed difference between two headings, (-180, 180]. */
export function headingDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Points along the great circle from A to B (inclusive), `steps` segments.
 * Used for the dashed route arcs. Returns [{latitude, longitude, t}].
 */
export function greatCirclePoints(lat1, lon1, lat2, lon2, steps = 64) {
  const φ1 = toRad(lat1), λ1 = toRad(lon1), φ2 = toRad(lat2), λ2 = toRad(lon2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
  ));
  const out = [];
  if (!Number.isFinite(d) || d === 0) return [{ latitude: lat1, longitude: lon1, t: 0 }, { latitude: lat2, longitude: lon2, t: 1 }];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ latitude: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), longitude: toDeg(Math.atan2(y, x)), t: f });
  }
  return out;
}

/**
 * Dead reckoning: where an asset is `dtSec` after its last fix, given its speed (m/s) and heading.
 * Ground assets and stationary assets do not move. Capped at 15 minutes so a stale fix never
 * runs off across an ocean.
 */
export function deadReckon(asset, dtSec) {
  const speed = Number(asset?.speedMps) || 0;
  const heading = Number(asset?.heading);
  const dt = Math.max(0, Math.min(Number(dtSec) || 0, 15 * 60));
  if (speed <= 0.5 || !Number.isFinite(heading) || dt === 0 || asset?.onGround) {
    return { latitude: asset.latitude, longitude: asset.longitude };
  }
  return destinationPoint(asset.latitude, asset.longitude, heading, speed * dt);
}

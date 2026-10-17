/**
 * Server-side demo fleet snapshot.
 * The demo company fleet is dead-reckoned from UTC along fixed routes around Rotterdam (same
 * positions for every client). Live worldwide aircraft come from /api/air, ships from /api/ships.
 */

import { destinationPoint, bearingBetween, distanceBetween } from "./geodesy.js";
export { destinationPoint, bearingBetween, distanceBetween };

const ORIGIN = { latitude: 51.9486, longitude: 4.1444 };

const P = (bearing, km) => destinationPoint(ORIGIN.latitude, ORIGIN.longitude, bearing, km * 1000);

const RISK_ZONES = [
  { name: "Maasvlakte anchorage congestion", lat: 51.93, lon: 3.98, radiusM: 4000 },
  { name: "Restricted exercise area", lat: 52.02, lon: 3.85, radiusM: 7000 },
  { name: "Dredging corridor", lat: 51.985, lon: 4.05, radiusM: 1500 },
];

const FLEET = [
  {
    id: "IMO9811000",
    name: "MSC Aurora",
    type: "vessel",
    operator: "MSC",
    cruiseSpeed: 7.2,
    altitudeMeters: 0,
    destination: "Maasvlakte II, Rotterdam",
    cargo: "14,200 TEU containers",
    route: [P(250, 42), P(265, 28), P(275, 14), P(285, 4), P(240, 12), P(250, 42)],
  },
  {
    id: "IMO9455312",
    name: "Nordic Tide",
    type: "vessel",
    operator: "Stena Bulk",
    cruiseSpeed: 5.8,
    altitudeMeters: 0,
    destination: "Europoort, Rotterdam",
    cargo: "Crude oil, 96,000 t",
    route: [P(300, 46), P(290, 30), P(280, 16), P(260, 8), P(320, 22), P(300, 46)],
  },
  {
    id: "IMO9702170",
    name: "Delta Pilot 3",
    type: "vessel",
    operator: "Loodswezen",
    cruiseSpeed: 11.5,
    altitudeMeters: 0,
    destination: "Pilot boarding area",
    cargo: "—",
    route: [P(270, 8), P(240, 18), P(300, 20), P(270, 8)],
  },
  {
    id: "GX-TR-4471",
    name: "Truck 4471",
    type: "truck",
    operator: "Geoxis Demo",
    cruiseSpeed: 22,
    altitudeMeters: 0,
    destination: "DC Waalhaven",
    cargo: "2 × 40ft reefer",
    route: [P(95, 6), P(110, 18), P(120, 30), P(100, 38), P(85, 26), P(95, 6)],
  },
  {
    id: "GX-TR-4488",
    name: "Truck 4488",
    type: "truck",
    operator: "Geoxis Demo",
    cruiseSpeed: 20,
    altitudeMeters: 0,
    destination: "Terminal Maasvlakte",
    cargo: "Empty return",
    route: [P(130, 34), P(120, 22), P(105, 12), P(90, 4), P(140, 20), P(130, 34)],
  },
  {
    id: "UAV-INSP-07",
    name: "Inspection drone 07",
    type: "drone",
    operator: "Port Authority",
    cruiseSpeed: 14,
    altitudeMeters: 120,
    destination: "Breakwater survey",
    cargo: "Optical / thermal payload",
    route: [P(200, 3), P(230, 7), P(190, 9), P(160, 6), P(200, 3)],
  },
];

function routeLength(route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceBetween(route[i].latitude, route[i].longitude, route[i + 1].latitude, route[i + 1].longitude);
  }
  return total;
}

function interpolateRoute(route, distanceM) {
  const loop = routeLength(route);
  if (loop <= 0) return { ...route[0], heading: 0 };
  let remain = ((distanceM % loop) + loop) % loop;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const seg = distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude);
    if (remain <= seg || i === route.length - 2) {
      const t = seg === 0 ? 0 : Math.min(1, remain / seg);
      const heading = bearingBetween(a.latitude, a.longitude, b.latitude, b.longitude);
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
        heading,
      };
    }
    remain -= seg;
  }
  const last = route[route.length - 1];
  return { latitude: last.latitude, longitude: last.longitude, heading: 0 };
}

function riskZoneAt(lat, lon) {
  for (const z of RISK_ZONES) {
    if (distanceBetween(lat, lon, z.lat, z.lon) <= z.radiusM) return z.name;
  }
  return null;
}

function fleetFrames(nowMs) {
  const tSec = nowMs / 1000;
  return FLEET.map((def) => {
    const pos = interpolateRoute(def.route, def.cruiseSpeed * tSec);
    const zone = riskZoneAt(pos.latitude, pos.longitude);
    const speed = def.cruiseSpeed;
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      operator: def.operator,
      latitude: +pos.latitude.toFixed(6),
      longitude: +pos.longitude.toFixed(6),
      altitudeMeters: def.altitudeMeters,
      heading: +pos.heading.toFixed(1),
      course: +pos.heading.toFixed(1),
      headingChange: 0,
      speedMps: +speed.toFixed(2),
      speedKnots: +(speed * 1.943844).toFixed(1),
      speedKph: +(speed * 3.6).toFixed(1),
      destination: def.destination,
      cargo: def.cargo,
      odometerKm: +((speed * tSec) / 1000).toFixed(2),
      alarm: Boolean(zone),
      alarmReason: zone ? `Inside risk zone: ${zone}` : null,
      source: "geoxis-fleet",
      timestamp: new Date(nowMs).toISOString(),
    };
  });
}

// 2026-10-17 (Claude, redesign): worldwide aircraft moved to /api/air (lib/airTraffic.js). This
// snapshot is the demo fleet only, so /api/assets stays cheap and never touches OpenSky.
export async function snapshot() {
  const sentAt = Date.now();
  const fleet = fleetFrames(sentAt);
  return {
    sentAt,
    origin: ORIGIN,
    sources: { fleet: "geoxis", air: "api/air" },
    assets: fleet,
  };
}

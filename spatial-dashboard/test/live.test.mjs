import { test } from "node:test";
import assert from "node:assert/strict";
import { compactState, compactStates, openSkyConfig, worldAircraft, resetAirCache, ANON_REFRESH_MS, AUTH_REFRESH_MS } from "../lib/airTraffic.js";
import { parseAdsbdb, parsePlanespotters, normalizeHex, normalizeCallsign, aircraftInfo } from "../lib/aircraftInfo.js";
import { parseAisMessage, mergeShips, parseBbox, shipTypeLabel, collectAis } from "../lib/ais.js";
import { deadReckon, greatCirclePoints, distanceBetween, destinationPoint } from "../lib/geodesy.js";
import { diffSnapshots, appendEvents } from "../lib/activity.js";
import { guessLocation } from "../lib/places.js";
import { parseCommons } from "../api/ship-photo.js";

const STATE = ["4ca87c", "RYR12AB ", "Ireland", 1700000000, 1700000005, 4.47, 51.92, 10668.0, false, 230.5, 88.2, 0.0, null, 10900.0, "1000", false, 0, 3];

test("opensky state vector → compact aircraft frame", () => {
  const a = compactState(STATE, 1700000010);
  assert.equal(a.id, "ICAO-4ca87c");
  assert.equal(a.callsign, "RYR12AB");
  assert.equal(a.latitude, 51.92);
  assert.equal(a.longitude, 4.47);
  assert.equal(a.altitudeMeters, 10900);
  assert.equal(a.speedMps, 230.5);
  assert.equal(a.heading, 88.2);
  assert.equal(a.ageSec, 5);
  assert.equal(a.onGround, false);
  assert.equal(compactState(["abc", "", "", 1, 1, null, null], 1), null);
  const old = compactStates({ time: 1700000400, states: [STATE] }, 1700000400);
  assert.equal(old.aircraft.length, 0, "positions older than 5 minutes are dropped");
  assert.equal(compactStates({ states: [STATE] }, 1700000010).aircraft.length, 1);
});

test("opensky refresh window: 15 min anonymous, 90 s with a free account", () => {
  assert.equal(openSkyConfig({}).refreshMs, ANON_REFRESH_MS);
  assert.equal(openSkyConfig({ OPENSKY_CLIENT_ID: "a", OPENSKY_CLIENT_SECRET: "b" }).refreshMs, AUTH_REFRESH_MS);
  assert.equal(openSkyConfig({ AIR_REFRESH_MS: "30000" }).refreshMs, 30000);
  assert.equal(openSkyConfig({ AIR_REFRESH_MS: "5" }).refreshMs, ANON_REFRESH_MS);
});

test("worldAircraft caches, and serves the last snapshot when upstream fails", async () => {
  resetAirCache();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; if (calls > 1) throw new Error("down"); return { ok: true, json: async () => ({ time: 1700000010, states: [STATE] }) }; };
  const first = await worldAircraft({ env: {}, fetchImpl, now: 1700000010 * 1000 });
  assert.equal(first.ok, true);
  assert.equal(first.count, 1);
  const cached = await worldAircraft({ env: {}, fetchImpl, now: 1700000010 * 1000 + 1000 });
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
  const later = await worldAircraft({ env: {}, fetchImpl, now: 1700000010 * 1000 + ANON_REFRESH_MS + 1 });
  assert.equal(later.stale, true);
  assert.equal(later.count, 1);
  resetAirCache();
});

test("adsbdb + planespotters payloads → aircraft identity, route, photo", () => {
  const info = parseAdsbdb({ response: {
    aircraft: { type: "Boeing 737-8AS", icao_type: "B738", manufacturer: "Boeing", registration: "EI-DWL", registered_owner: "Ryanair", registered_owner_country_name: "Ireland", url_photo: "https://x/p.jpg", url_photo_thumbnail: "https://x/t.jpg" },
    flightroute: { callsign: "RYR12AB", callsign_iata: "FR12", airline: { name: "Ryanair", icao: "RYR", iata: "FR", country: "Ireland" },
      origin: { iata_code: "DUB", icao_code: "EIDW", name: "Dublin Airport", municipality: "Dublin", country_name: "Ireland", latitude: 53.42, longitude: -6.27 },
      destination: { iata_code: "AMS", icao_code: "EHAM", name: "Schiphol", municipality: "Amsterdam", country_name: "Netherlands", latitude: 52.31, longitude: 4.76 } },
  } }, "4ca87c", "RYR12AB");
  assert.equal(info.registration, "EI-DWL");
  assert.equal(info.typeName, "Boeing 737-8AS");
  assert.equal(info.airline.name, "Ryanair");
  assert.equal(info.origin.iata, "DUB");
  assert.equal(info.destination.latitude, 52.31);
  assert.equal(info.photo.src, "https://x/p.jpg");
  assert.equal(parseAdsbdb({ response: "unknown aircraft" }, "4ca87c", null).registration, null);
  const ps = parsePlanespotters({ photos: [{ thumbnail: { src: "t" }, thumbnail_large: { src: "L" }, link: "l", photographer: "Jo" }] });
  assert.equal(ps.src, "L");
  assert.match(ps.credit, /Jo/);
  assert.equal(parsePlanespotters({ photos: [] }), null);
  assert.equal(normalizeHex(" 4CA87C "), "4ca87c");
  assert.equal(normalizeHex("zz"), null);
  assert.equal(normalizeCallsign(" ryr 12ab "), "RYR12AB");
});

test("aircraftInfo merges both lookups and falls back to planespotters", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("/aircraft/")) return { ok: true, json: async () => ({ response: { aircraft: { registration: "N1", type: "A320" } } }) };
    if (url.includes("/callsign/")) return { ok: true, json: async () => ({ response: { flightroute: { airline: { name: "Test Air" } } } }) };
    return { ok: true, json: async () => ({ photos: [{ thumbnail_large: { src: "P" }, photographer: "Z" }] }) };
  };
  const r = await aircraftInfo({ hex: "abcdef", callsign: "TST1", fetchImpl, now: 1 });
  assert.equal(r.found, true);
  assert.equal(r.registration, "N1");
  assert.equal(r.airline.name, "Test Air");
  assert.equal(r.photo.src, "P");
  assert.equal(seen.length, 3);
  const bad = await aircraftInfo({ hex: "nope", fetchImpl });
  assert.equal(bad.ok, false);
});

test("AIS: position + static messages merge into one ship", () => {
  const pos = parseAisMessage({ MessageType: "PositionReport", MetaData: { MMSI: 123, ShipName: "MSC AURORA ", latitude: 51.95, longitude: 3.98, time_utc: "2026-10-17 08:00:00.000 +0000 UTC" }, Message: { PositionReport: { Sog: 14, Cog: 92.5, TrueHeading: 511, NavigationalStatus: 0 } } });
  assert.equal(pos.id, "MMSI-123");
  assert.equal(pos.name, "MSC AURORA");
  assert.equal(pos.heading, 92.5, "TrueHeading 511 means unknown → COG");
  assert.equal(pos.speedMps, 7.2);
  assert.equal(pos.navStatus, "Under way");
  const stat = parseAisMessage({ MessageType: "ShipStaticData", MetaData: { MMSI: 123, ShipName: "MSC AURORA" }, Message: { ShipStaticData: { ImoNumber: 9811000, Type: 71, Destination: "NLRTM", CallSign: "ABCD" } } });
  assert.equal(stat.vesselType, "Cargo ship");
  const ships = mergeShips([stat, pos, null, parseAisMessage({ MessageType: "ShipStaticData", MetaData: { MMSI: 999 }, Message: {} })]);
  assert.equal(ships.length, 1, "static-only ships without a position are dropped");
  assert.equal(ships[0].imo, 9811000);
  assert.equal(ships[0].destination, "NLRTM");
  assert.equal(ships[0].latitude, 51.95);
  assert.deepEqual(parseBbox("50,3,53,5"), [[50, 3], [53, 5]]);
  assert.deepEqual(parseBbox("junk"), [[-90, -180], [90, 180]]);
  assert.equal(shipTypeLabel(84), "Tanker");
});

test("AIS collector answers demo without a key or websocket, and collects with a fake socket", async () => {
  const none = await collectAis({ apiKey: "", bbox: [[0, 0], [1, 1]] });
  assert.equal(none.demo, true);
  class FakeWs {
    constructor() { setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ MessageType: "PositionReport", MetaData: { MMSI: 7, ShipName: "T", latitude: 1, longitude: 2 }, Message: { PositionReport: { Sog: 0 } } }) }); }, 5); }
    send(body) { assert.match(body, /"APIKey":"k"/); }
    close() { this.onclose?.(); }
  }
  const got = await collectAis({ apiKey: "k", bbox: [[0, 0], [5, 5]], listenMs: 60, WebSocketImpl: FakeWs });
  assert.equal(got.demo, false);
  assert.equal(got.count, 1);
  assert.equal(got.ships[0].id, "MMSI-7");
});

test("geodesy: dead reckoning moves along heading, never for ground or stale frames", () => {
  const a = { latitude: 0, longitude: 0, speedMps: 100, heading: 90 };
  const p = deadReckon(a, 60);
  assert.ok(p.longitude > 0.05 && p.longitude < 0.06);
  assert.ok(Math.abs(p.latitude) < 1e-6);
  assert.deepEqual(deadReckon({ ...a, onGround: true }, 60), { latitude: 0, longitude: 0 });
  const capped = deadReckon(a, 3600);
  const expected = destinationPoint(0, 0, 90, 100 * 900);
  assert.ok(Math.abs(capped.longitude - expected.longitude) < 1e-6, "capped at 15 minutes");
  const arc = greatCirclePoints(50, -0.1, 40.6, -73.8, 10);
  assert.equal(arc.length, 11);
  assert.ok(arc[5].latitude > 50, "great circle bows north between London and New York");
  assert.ok(Math.abs(distanceBetween(0, 0, 0, 1) - 111_195) < 50);
});

test("activity: events from snapshot diffs", () => {
  const prev = [{ id: "ICAO-a", name: "LH722", type: "aircraft", country: "Germany", onGround: true, altitudeMeters: 0 }, { id: "MMSI-1", name: "Aurora", type: "vessel", speedMps: 5 }];
  const next = [{ id: "ICAO-a", name: "LH722", type: "aircraft", country: "France", onGround: false, altitudeMeters: 3000 }, { id: "MMSI-1", name: "Aurora", type: "vessel", speedMps: 0 }, { id: "ICAO-b", name: "UA1", type: "aircraft", country: "USA" }];
  const ev = diffSnapshots(prev, next, { at: 1000 });
  const kinds = ev.map((e) => e.kind);
  assert.ok(kinds.includes("departed"));
  assert.ok(kinds.includes("border"));
  assert.ok(kinds.includes("stopped"));
  assert.ok(kinds.includes("appeared"));
  const feed = appendEvents([], ev);
  const again = appendEvents(feed, ev);
  assert.equal(again.length, feed.length, "duplicates within 60 s are dropped");
  assert.equal(diffSnapshots(next, prev, { at: 2000 }).some((e) => e.kind === "lost"), true);
});

test("opening location: time zone table, then UTC offset", () => {
  assert.equal(guessLocation("Europe/Amsterdam").source, "timezone");
  assert.equal(guessLocation("America/Chicago").longitude, -87.63);
  const off = guessLocation("Mars/Olympus", -600);
  assert.equal(off.source, "offset");
  assert.equal(off.longitude, 150);
});

test("wikimedia commons payload → photo", () => {
  const p = parseCommons({ query: { pages: { 1: { imageinfo: [{ thumburl: "https://u/a.jpg", descriptionurl: "https://d" }] } } } });
  assert.equal(p.src, "https://u/a.jpg");
  assert.equal(parseCommons({ query: { pages: { 1: { imageinfo: [{ thumburl: "https://u/a.svg" }] } } } }), null);
});

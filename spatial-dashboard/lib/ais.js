// Live ships from AIS via aisstream.io. Server only (AISSTREAM_API_KEY).
//
// AISStream is a websocket, and a serverless function cannot hold one open, so /api/ships opens the
// stream, listens for a few seconds inside the requested box, and returns what it heard. The CDN
// caches that snapshot for a minute per box. Without a key the route answers demo: true and the
// globe shows the Rotterdam demo vessels instead.

export const AIS_URL = "wss://stream.aisstream.io/v0/stream";
export const DEFAULT_LISTEN_MS = 6000;
export const MAX_SHIPS = 4000;

const KNOT_MPS = 0.514444;

const NAV_STATUS = {
  0: "Under way", 1: "At anchor", 2: "Not under command", 3: "Restricted", 4: "Constrained by draught",
  5: "Moored", 6: "Aground", 7: "Fishing", 8: "Under way (sailing)", 15: "Under way",
};

export function aisKey(env = process.env) {
  const k = String(env.AISSTREAM_API_KEY || "").trim();
  return k.length > 10 ? k : "";
}

/** "s,w,n,e" → [[s,w],[n,e]] or the whole world. */
export function parseBbox(input) {
  const parts = String(input || "").split(",").map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    const [s, w, n, e] = parts;
    if (s >= -90 && n <= 90 && s < n && w >= -180 && e <= 180 && w < e) return [[s, w], [n, e]];
  }
  return [[-90, -180], [90, 180]];
}

export function shipTypeLabel(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return "Vessel";
  if (n >= 70 && n <= 79) return "Cargo ship";
  if (n >= 80 && n <= 89) return "Tanker";
  if (n >= 60 && n <= 69) return "Passenger ship";
  if (n === 30) return "Fishing vessel";
  if (n === 31 || n === 32 || n === 52) return "Tug";
  if (n === 36 || n === 37) return "Pleasure craft";
  if (n === 50) return "Pilot vessel";
  if (n === 51) return "Search and rescue";
  if (n === 55) return "Law enforcement";
  if (n >= 40 && n <= 49) return "High-speed craft";
  return "Vessel";
}

/** One AISStream message → a partial ship frame keyed by MMSI, or null. Pure. */
export function parseAisMessage(msg, nowIso = new Date().toISOString()) {
  const meta = msg?.MetaData;
  const mmsi = meta?.MMSI;
  if (!Number.isFinite(mmsi)) return null;
  const base = { id: `MMSI-${mmsi}`, mmsi, name: String(meta.ShipName || "").trim() || `MMSI ${mmsi}` };
  if (msg.MessageType === "PositionReport") {
    const p = msg.Message?.PositionReport || {};
    const lat = Number(meta.latitude ?? p.Latitude);
    const lon = Number(meta.longitude ?? p.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const sog = Number(p.Sog);
    const hdg = Number(p.TrueHeading);
    const cog = Number(p.Cog);
    const heading = Number.isFinite(hdg) && hdg >= 0 && hdg < 360 ? hdg : Number.isFinite(cog) && cog < 360 ? cog : 0;
    return {
      ...base,
      type: "vessel",
      latitude: +lat.toFixed(5),
      longitude: +lon.toFixed(5),
      speedMps: Number.isFinite(sog) && sog < 102 ? +(sog * KNOT_MPS).toFixed(2) : 0,
      heading: +heading.toFixed(1),
      navStatus: NAV_STATUS[p.NavigationalStatus] || null,
      timestamp: meta.time_utc ? new Date(String(meta.time_utc).replace(" +0000 UTC", "Z").replace(" ", "T")).toISOString() : nowIso,
      source: "aisstream",
    };
  }
  if (msg.MessageType === "ShipStaticData") {
    const s = msg.Message?.ShipStaticData || {};
    const imo = Number(s.ImoNumber);
    return {
      ...base,
      imo: Number.isFinite(imo) && imo > 0 ? imo : null,
      vesselType: shipTypeLabel(s.Type),
      destination: String(s.Destination || "").trim() || null,
      callsign: String(s.CallSign || "").trim() || null,
      static: true,
    };
  }
  return null;
}

/** Merge parsed messages into one list (position reports win on coordinates, static data adds identity). */
export function mergeShips(parsed, max = MAX_SHIPS) {
  const byId = new Map();
  for (const p of parsed) {
    if (!p) continue;
    const cur = byId.get(p.id) || {};
    byId.set(p.id, { ...cur, ...p });
  }
  const ships = [];
  for (const s of byId.values()) {
    if (!Number.isFinite(s.latitude)) continue;
    delete s.static;
    if (!s.vesselType) s.vesselType = "Vessel";
    ships.push(s);
    if (ships.length >= max) break;
  }
  return ships;
}

/**
 * Open the AISStream websocket, listen for `listenMs`, return what arrived in the box.
 * Needs a WebSocket implementation (Node 22 has one globally). Never throws.
 */
export async function collectAis({ apiKey, bbox, listenMs = DEFAULT_LISTEN_MS, WebSocketImpl = globalThis.WebSocket } = {}) {
  if (!apiKey) return { ok: false, demo: true, reason: "AISSTREAM_API_KEY not set", ships: [] };
  if (typeof WebSocketImpl !== "function") return { ok: false, demo: true, reason: "websocket_unavailable", ships: [] };
  const parsed = [];
  const nowIso = new Date().toISOString();
  return new Promise((resolve) => {
    let ws;
    let settled = false;
    const finish = (extra = {}) => {
      if (settled) return;
      settled = true;
      try { ws?.close(); } catch { /* closed */ }
      const ships = mergeShips(parsed);
      resolve({ ok: ships.length > 0 || !extra.error, demo: false, listenMs, ships, count: ships.length, ...extra });
    };
    const timer = setTimeout(() => finish(), listenMs);
    try {
      ws = new WebSocketImpl(AIS_URL);
    } catch (err) {
      clearTimeout(timer);
      return finish({ error: String(err?.message || err) });
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ APIKey: apiKey, BoundingBoxes: [bbox], FilterMessageTypes: ["PositionReport", "ShipStaticData"] }));
    };
    ws.onmessage = (evt) => {
      try {
        const text = typeof evt.data === "string" ? evt.data : Buffer.from(evt.data).toString("utf8");
        const p = parseAisMessage(JSON.parse(text), nowIso);
        if (p) parsed.push(p);
        if (parsed.length >= MAX_SHIPS * 3) { clearTimeout(timer); finish(); }
      } catch { /* skip malformed */ }
    };
    ws.onerror = () => { clearTimeout(timer); finish({ error: "aisstream_error" }); };
    ws.onclose = () => { clearTimeout(timer); finish(); };
  });
}

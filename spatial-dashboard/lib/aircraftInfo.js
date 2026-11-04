// Who an aircraft is and where it is going, from free public lookups. Server only.
//   adsbdb.com      /v0/aircraft/{hex}?callsign={cs} → type, registration, operator, route, photo
//   planespotters   /pub/photos/hex/{hex}             → photo fallback (credit required)
// Both are keyless. Results are cached per instance and at the CDN for a day (api/aircraft.js).

const ADSBDB = "https://api.adsbdb.com/v0";
const PLANESPOTTERS = "https://api.planespotters.net/pub/photos/hex";

const HEX_RE = /^[0-9a-f]{6}$/;
const CALLSIGN_RE = /^[A-Z0-9]{2,8}$/;

export function normalizeHex(hex) {
  const h = String(hex || "").trim().toLowerCase();
  return HEX_RE.test(h) ? h : null;
}

export function normalizeCallsign(cs) {
  const c = String(cs || "").trim().toUpperCase().replace(/\s+/g, "");
  return CALLSIGN_RE.test(c) ? c : null;
}

function airport(a) {
  if (!a || typeof a !== "object") return null;
  const lat = Number(a.latitude);
  const lon = Number(a.longitude);
  return {
    iata: a.iata_code || null,
    icao: a.icao_code || null,
    name: a.name || null,
    city: a.municipality || null,
    country: a.country_name || a.country_iso_name || null,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
  };
}

/** adsbdb payload (aircraft and/or flightroute) → one flat info object. Pure. */
export function parseAdsbdb(payload, hex, callsign) {
  const r = payload?.response && typeof payload.response === "object" ? payload.response : {};
  const ac = r.aircraft && typeof r.aircraft === "object" ? r.aircraft : null;
  const fr = r.flightroute && typeof r.flightroute === "object" ? r.flightroute : null;
  const info = {
    hex,
    callsign: callsign || fr?.callsign || null,
    registration: ac?.registration || null,
    typeName: ac?.type || null,
    typeCode: ac?.icao_type || null,
    manufacturer: ac?.manufacturer || null,
    operator: ac?.registered_owner || null,
    operatorCountry: ac?.registered_owner_country_name || null,
    airline: fr?.airline ? { name: fr.airline.name || null, icao: fr.airline.icao || null, iata: fr.airline.iata || null, country: fr.airline.country || null } : null,
    flightNumber: fr?.callsign_iata || null,
    origin: airport(fr?.origin),
    destination: airport(fr?.destination),
    photo: null,
  };
  if (ac?.url_photo) {
    info.photo = { src: ac.url_photo, thumb: ac.url_photo_thumbnail || ac.url_photo, link: null, photographer: null, credit: "Photo via adsbdb / Planespotters.net" };
  }
  if (!info.operator && info.airline?.name) info.operator = info.airline.name;
  return info;
}

/** planespotters payload → photo object or null. Pure. */
export function parsePlanespotters(payload) {
  const p = Array.isArray(payload?.photos) ? payload.photos[0] : null;
  if (!p) return null;
  const src = p.thumbnail_large?.src || p.thumbnail?.src || null;
  if (!src) return null;
  return {
    src,
    thumb: p.thumbnail?.src || src,
    link: p.link || null,
    photographer: p.photographer || null,
    credit: p.photographer ? `Photo © ${p.photographer} via Planespotters.net` : "Photo via Planespotters.net",
  };
}

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function getJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Geoxis/1.0 (live globe)" }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Look an aircraft up. Never throws. { ok, found, ...info }. */
export async function aircraftInfo({ hex, callsign, fetchImpl = fetch, now = Date.now(), timeoutMs = 6000 } = {}) {
  const h = normalizeHex(hex);
  const c = normalizeCallsign(callsign);
  if (!h) return { ok: false, found: false, error: "invalid_hex" };
  const key = `${h}|${c || ""}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

  const [acPayload, routePayload] = await Promise.all([
    getJson(`${ADSBDB}/aircraft/${h}`, fetchImpl, timeoutMs),
    c ? getJson(`${ADSBDB}/callsign/${c}`, fetchImpl, timeoutMs) : Promise.resolve(null),
  ]);
  const merged = { response: { ...(acPayload?.response && typeof acPayload.response === "object" ? acPayload.response : {}), ...(routePayload?.response && typeof routePayload.response === "object" ? routePayload.response : {}) } };
  const info = parseAdsbdb(merged, h, c);
  if (!info.photo) {
    const ps = await getJson(`${PLANESPOTTERS}/${h}`, fetchImpl, timeoutMs);
    info.photo = parsePlanespotters(ps);
  }
  const found = Boolean(info.registration || info.typeName || info.origin || info.photo);
  const value = { ok: true, found, ...info };
  cache.set(key, { at: now, value });
  if (cache.size > 5000) cache.clear();
  return value;
}

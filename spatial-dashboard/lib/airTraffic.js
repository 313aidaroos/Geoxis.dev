// Worldwide live aircraft from the OpenSky Network (ADS-B). Server only.
//
// Quota (OpenSky, 2026): anonymous callers get 400 credits a day and a worldwide states/all
// call costs 4 credits, so anonymous refreshes are spaced 15 minutes apart. A free OpenSky
// account (OPENSKY_CLIENT_ID + OPENSKY_CLIENT_SECRET, OAuth2 client credentials) gets 4,000
// credits a day, which allows one worldwide refresh every 90 seconds. The browser dead-reckons
// every aircraft between refreshes from its speed and track, so movement stays smooth either way.
// The /api/air route also sets s-maxage so Vercel's CDN serves one fetch to every visitor.

const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

export const ANON_REFRESH_MS = 15 * 60 * 1000;
export const AUTH_REFRESH_MS = 90 * 1000;
export const MAX_AIRCRAFT = 12_000;

export function openSkyConfig(env = process.env) {
  const clientId = String(env.OPENSKY_CLIENT_ID || "").trim();
  const clientSecret = String(env.OPENSKY_CLIENT_SECRET || "").trim();
  const authenticated = Boolean(clientId && clientSecret);
  const override = Number(env.AIR_REFRESH_MS);
  return {
    clientId,
    clientSecret,
    authenticated,
    refreshMs: Number.isFinite(override) && override >= 10_000 ? override : authenticated ? AUTH_REFRESH_MS : ANON_REFRESH_MS,
  };
}

/** One OpenSky state vector → the compact frame the globe draws. Null when it has no position. */
export function compactState(s, nowSec) {
  if (!Array.isArray(s)) return null;
  const lon = s[5];
  const lat = s[6];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const hex = String(s[0] || "").trim().toLowerCase();
  if (!hex) return null;
  const callsign = String(s[1] || "").trim().toUpperCase();
  const onGround = Boolean(s[8]);
  const alt = Number.isFinite(s[13]) ? s[13] : Number.isFinite(s[7]) ? s[7] : 0;
  const vel = Number.isFinite(s[9]) ? s[9] : 0;
  const track = Number.isFinite(s[10]) ? s[10] : 0;
  const lastContact = Number.isFinite(s[4]) ? s[4] : Number.isFinite(s[3]) ? s[3] : nowSec;
  return {
    id: `ICAO-${hex}`,
    hex,
    callsign: callsign || null,
    name: callsign || hex.toUpperCase(),
    type: "aircraft",
    country: s[2] || null,
    latitude: +lat.toFixed(5),
    longitude: +lon.toFixed(5),
    altitudeMeters: Math.round(alt || 0),
    onGround,
    heading: +track.toFixed(1),
    speedMps: +vel.toFixed(1),
    verticalRateMps: Number.isFinite(s[11]) ? +s[11].toFixed(1) : 0,
    category: Number.isFinite(s[16]) ? s[16] : 0,
    ageSec: Math.max(0, Math.round(nowSec - lastContact)),
    source: "opensky",
  };
}

/** Whole states/all payload → { time, aircraft[] }. Drops positions older than 5 minutes. */
export function compactStates(json, nowSec = Math.floor(Date.now() / 1000)) {
  const states = Array.isArray(json?.states) ? json.states : [];
  const aircraft = [];
  for (const s of states) {
    const a = compactState(s, nowSec);
    if (!a || a.ageSec > 300) continue;
    aircraft.push(a);
    if (aircraft.length >= MAX_AIRCRAFT) break;
  }
  return { time: Number.isFinite(json?.time) ? json.time : nowSec, aircraft };
}

let tokenCache = { value: "", expiresAt: 0 };

async function bearerToken(cfg, fetchImpl, now) {
  if (!cfg.authenticated) return "";
  if (tokenCache.value && tokenCache.expiresAt > now + 30_000) return tokenCache.value;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetchImpl(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) throw new Error(`opensky_token_${res.status}`);
  const json = await res.json();
  tokenCache = { value: json.access_token || "", expiresAt: now + (Number(json.expires_in) || 1800) * 1000 };
  return tokenCache.value;
}

let airCache = { at: 0, body: null, ok: false };

/**
 * Worldwide aircraft snapshot, cached per instance for `refreshMs`. Never throws: a failed fetch
 * returns the last good snapshot (flagged stale) or an empty list.
 */
export async function worldAircraft({ env = process.env, fetchImpl = fetch, now = Date.now(), timeoutMs = 9000 } = {}) {
  const cfg = openSkyConfig(env);
  // Local development only (GEOXIS_FAKE_AIR=1): synthetic traffic so the globe can be worked on
  // without network access. Never set this in Vercel.
  if (env.GEOXIS_FAKE_AIR === "1") return fakeAircraft(now, cfg);
  if (airCache.body && now - airCache.at < cfg.refreshMs) return { ...airCache.body, cached: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json", "User-Agent": "Geoxis/1.0 (live globe)" };
    const token = await bearerToken(cfg, fetchImpl, now).catch(() => "");
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(STATES_URL, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`opensky_${res.status}`);
    const json = await res.json();
    const { time, aircraft } = compactStates(json, Math.floor(now / 1000));
    const body = { ok: true, source: "opensky", authenticated: cfg.authenticated, refreshMs: cfg.refreshMs, fetchedAt: now, time, count: aircraft.length, aircraft };
    airCache = { at: now, body, ok: true };
    return body;
  } catch (err) {
    const stale = airCache.body;
    if (stale) return { ...stale, ok: false, stale: true, error: String(err?.message || err) };
    return { ok: false, source: "opensky", authenticated: cfg.authenticated, refreshMs: cfg.refreshMs, fetchedAt: now, count: 0, aircraft: [], error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook. */
export function resetAirCache() {
  airCache = { at: 0, body: null, ok: false };
  tokenCache = { value: "", expiresAt: 0 };
}

function fakeAircraft(now, cfg) {
  const seed = Math.floor(now / 60_000);
  let x = seed % 2147483647 || 1;
  const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const countries = ["United States", "Germany", "France", "United Kingdom", "Netherlands", "United Arab Emirates", "Japan", "Brazil", "India", "Australia"];
  const aircraft = [];
  for (let i = 0; i < 1500; i++) {
    const lat = (rnd() * 150 - 60) * (rnd() < 0.8 ? 1 : 0.4);
    const lon = rnd() * 360 - 180;
    const hex = (0x100000 + i * 7919).toString(16).slice(-6);
    aircraft.push({ id: `ICAO-${hex}`, hex, callsign: `DEV${String(i).padStart(3, "0")}`, name: `DEV${String(i).padStart(3, "0")}`, type: "aircraft", country: countries[i % countries.length], latitude: +lat.toFixed(4), longitude: +lon.toFixed(4), altitudeMeters: 9000 + Math.round(rnd() * 3000), onGround: rnd() < 0.05, heading: Math.round(rnd() * 360), speedMps: 200 + Math.round(rnd() * 60), verticalRateMps: 0, category: 0, ageSec: Math.round(rnd() * 20), source: "fake" });
  }
  return { ok: true, source: "fake", authenticated: cfg.authenticated, refreshMs: 60_000, fetchedAt: seed * 60_000, time: Math.floor(now / 1000), count: aircraft.length, aircraft };
}

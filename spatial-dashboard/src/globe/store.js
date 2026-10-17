// Live state for the globe page: every asset from every feed, 30 minutes of history per asset,
// dead-reckoned positions between refreshes, replay, selection, layers, stats and the activity feed.
// No DOM here; panels.js and earth.js subscribe to its events.
import { authHeader, clearSession, getToken } from "../authClient.js";
import { deadReckon } from "../../lib/geodesy.js";
import { diffSnapshots, appendEvents } from "../../lib/activity.js";
import { normalizeType } from "./icons.js";

export const HISTORY_MS = 30 * 60 * 1000;
const FLEET_POLL_MS = 2000;
const SHIP_POLL_MS = 60_000;
const SAMPLE_GAP_MS = 5000;
const STATS_EVERY_MS = 10_000;

export class Store extends EventTarget {
  constructor() {
    super();
    this.assets = new Map();
    this.history = new Map();
    this.info = new Map();
    this.types = { aircraft: true, vessel: true, truck: true, container: true, drone: true, person: true, train: true, other: true };
    this.layers = { routes: false, weather: false, risk: true, trails: true, labels: true, daynight: true };
    this.selectedId = null;
    this.replayOffset = 0;
    this.feed = [];
    this.countHistory = [];
    this.meta = { fleet: { demo: true, tenant: null, status: "connecting" }, air: { ok: false, count: 0, refreshMs: 0, fetchedAt: 0, authenticated: false }, ships: { demo: true, count: 0 } };
    this.signedIn = Boolean(getToken());
    this._timers = [];
    this._airIds = new Set();
    this._shipMiss = new Map();
    this._toldTenant = false;
    this._lastStats = 0;
    this._bbox = null;
    this._stopped = false;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  start() {
    this.#pollFleet();
    this.#pollAir();
    this.#pollShips();
    this._timers.push(setInterval(() => this.#sweep(), 5000));
    this._timers.push(setInterval(() => this.#stats(true), STATS_EVERY_MS));
  }

  stop() {
    this._stopped = true;
    for (const t of this._timers) { clearInterval(t); clearTimeout(t); }
  }

  setViewBbox(bbox) { this._bbox = bbox; }

  /* ---------------- ingest ---------------- */

  upsert(frame, { at = Date.now(), source = "fleet", demo = false } = {}) {
    const type = normalizeType(frame.type);
    const prev = this.assets.get(frame.id);
    const next = { ...prev, ...frame, type, at, ageSec: Number(frame.ageSec) || 0, source, demo, seenAt: Date.now() };
    this.assets.set(frame.id, next);
    const h = this.history.get(frame.id) || [];
    const last = h[h.length - 1];
    const t = at - next.ageSec * 1000;
    if (!last || t - last.t >= SAMPLE_GAP_MS || source === "air") {
      h.push({ t, latitude: next.latitude, longitude: next.longitude, altitudeMeters: next.altitudeMeters || 0, speedMps: next.speedMps || 0, heading: next.heading || 0, onGround: Boolean(next.onGround) });
      const cutoff = Date.now() - HISTORY_MS;
      while (h.length && h[0].t < cutoff) h.shift();
      this.history.set(frame.id, h);
    }
    return next;
  }

  remove(id) {
    if (!this.assets.delete(id)) return;
    this.history.delete(id);
    if (this.selectedId === id) this.select(null);
    this.emit("removed", { id });
  }

  async #pollFleet() {
    if (this._stopped) return;
    try {
      const headers = this.signedIn ? authHeader() : {};
      let res = await fetch("/api/assets", { cache: "no-store", headers });
      if (res.status === 401 && this.signedIn) {
        clearSession();
        this.signedIn = false;
        this.emit("toast", { text: "Your session expired. Showing the public demo fleet; sign in again for your fleet.", kind: "error" });
        res = await fetch("/api/assets", { cache: "no-store" });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const prevFleet = new Map([...this.assets].filter(([, a]) => a.source === "fleet"));
      const now = Date.now();
      const seen = new Set();
      for (const f of json.assets || []) {
        if (!f || typeof f.id !== "string" || !Number.isFinite(f.latitude)) continue;
        seen.add(f.id);
        this.upsert({ ...f, source: undefined }, { at: typeof json.sentAt === "number" ? json.sentAt : now, source: "fleet", demo: json.demo !== false });
      }
      for (const id of prevFleet.keys()) if (!seen.has(id)) this.remove(id);
      this.meta.fleet = { demo: json.demo !== false, tenant: json.tenant || null, status: "live", latencyMs: typeof json.sentAt === "number" ? Math.max(0, now - json.sentAt) : null };
      if (json.tenant && !this._toldTenant) {
        this._toldTenant = true;
        this.emit("toast", { text: json.demo === false ? `Live: ${json.tenant.name || json.tenant.slug}'s fleet.` : `No positions yet for ${json.tenant.name || json.tenant.slug}. Showing the demo fleet. Post yours to /api/positions.` });
      }
      const nextFleet = new Map([...this.assets].filter(([, a]) => a.source === "fleet"));
      this.#feed(diffSnapshots(prevFleet, nextFleet, { at: now, max: 4 }));
      this.emit("assets", { source: "fleet" });
      this.emit("meta", this.meta);
    } catch (err) {
      this.meta.fleet.status = "error";
      this.emit("meta", this.meta);
    } finally {
      this._timers.push(setTimeout(() => this.#pollFleet(), FLEET_POLL_MS));
    }
  }

  async #pollAir() {
    if (this._stopped) return;
    let nextIn = 60_000;
    try {
      const res = await fetch("/api/air", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const now = Date.now();
      const fetchedAt = Number(json.fetchedAt) || now;
      const refreshMs = Number(json.refreshMs) || 15 * 60 * 1000;
      if (fetchedAt !== this.meta.air.fetchedAt) {
        const prevAir = new Map([...this.assets].filter(([, a]) => a.source === "air"));
        const ids = new Set();
        for (const a of json.aircraft || []) {
          ids.add(a.id);
          this.upsert(a, { at: fetchedAt, source: "air", demo: false });
        }
        for (const id of this._airIds) if (!ids.has(id)) this.remove(id);
        this._airIds = ids;
        const nextAir = new Map([...this.assets].filter(([, a]) => a.source === "air"));
        this.#feed(diffSnapshots(prevAir, nextAir, { at: now, max: prevAir.size ? 8 : 0 }));
      }
      this.meta.air = { ok: json.ok !== false, stale: Boolean(json.stale), count: json.count || 0, refreshMs, fetchedAt, authenticated: Boolean(json.authenticated), error: json.error || null };
      nextIn = Math.max(15_000, Math.min(refreshMs, fetchedAt + refreshMs + 3000 - now));
      this.emit("assets", { source: "air" });
      this.emit("meta", this.meta);
    } catch (err) {
      this.meta.air = { ...this.meta.air, ok: false, error: String(err?.message || err) };
      this.emit("meta", this.meta);
      nextIn = 30_000;
    } finally {
      this._timers.push(setTimeout(() => this.#pollAir(), nextIn));
    }
  }

  async #pollShips() {
    if (this._stopped) return;
    try {
      const bbox = this._bbox && this._bbox.every(Number.isFinite) ? this._bbox.map((v) => v.toFixed(1)).join(",") : "";
      const res = await fetch(`/api/ships${bbox ? `?bbox=${bbox}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const now = Date.now();
      if (!json.demo) {
        const prevShips = new Map([...this.assets].filter(([, a]) => a.source === "ais"));
        const ids = new Set();
        for (const s of json.ships || []) {
          ids.add(s.id);
          const at = s.timestamp ? Date.parse(s.timestamp) : now;
          this.upsert({ ...s, name: s.name }, { at: Number.isFinite(at) ? Math.min(at, now) : now, source: "ais", demo: false });
          this._shipMiss.delete(s.id);
        }
        for (const [id, a] of this.assets) {
          if (a.source !== "ais" || ids.has(id)) continue;
          const miss = (this._shipMiss.get(id) || 0) + 1;
          if (miss >= 3) { this.remove(id); this._shipMiss.delete(id); } else this._shipMiss.set(id, miss);
        }
        const nextShips = new Map([...this.assets].filter(([, a]) => a.source === "ais"));
        this.#feed(diffSnapshots(prevShips, nextShips, { at: now, max: prevShips.size ? 4 : 0 }));
      }
      this.meta.ships = { demo: Boolean(json.demo), count: json.count || 0, reason: json.reason || null, bbox: json.bbox || null };
      this.emit("assets", { source: "ships" });
      this.emit("meta", this.meta);
    } catch (err) {
      this.meta.ships = { ...this.meta.ships, error: String(err?.message || err) };
      this.emit("meta", this.meta);
    } finally {
      this._timers.push(setTimeout(() => this.#pollShips(), SHIP_POLL_MS));
    }
  }

  #sweep() {
    const now = Date.now();
    for (const [id, a] of this.assets) {
      const limit = a.source === "fleet" ? 15_000 : a.source === "air" ? Math.max(3 * (this.meta.air.refreshMs || 0), 20 * 60_000) : 15 * 60_000;
      if (now - a.seenAt > limit) this.remove(id);
    }
  }

  #feed(events) {
    if (!events.length) return;
    this.feed = appendEvents(this.feed, events);
    this.emit("feed", { feed: this.feed, fresh: events });
  }

  /* ---------------- derived ---------------- */

  visible(a) {
    return Boolean(this.types[a.type] ?? true);
  }

  /** Where to draw an asset right now (live, dead-reckoned) or at the replay time. Null = hide. */
  positionAt(id, nowMs = Date.now()) {
    const a = this.assets.get(id);
    if (!a) return null;
    if (this.replayOffset > 0) {
      const target = nowMs - this.replayOffset * 1000;
      const h = this.history.get(id);
      if (!h || !h.length || h[0].t > target) return null;
      let s = h[0];
      for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= target) { s = h[i]; break; }
      const p = deadReckon({ latitude: s.latitude, longitude: s.longitude, speedMps: s.speedMps, heading: s.heading, onGround: s.onGround }, (target - s.t) / 1000);
      return { ...p, altitudeMeters: s.altitudeMeters, heading: s.heading };
    }
    const dt = (nowMs - a.at) / 1000 + (a.ageSec || 0);
    const p = deadReckon(a, dt);
    return { ...p, altitudeMeters: a.altitudeMeters || 0, heading: a.heading || 0 };
  }

  trailFor(id, nowMs = Date.now()) {
    const h = this.history.get(id);
    if (!h) return [];
    const end = this.replayOffset > 0 ? nowMs - this.replayOffset * 1000 : nowMs;
    return h.filter((s) => s.t <= end);
  }

  counts() {
    const c = { aircraft: 0, vessel: 0, truck: 0, container: 0, drone: 0, person: 0, train: 0, other: 0, total: 0, alerts: 0, demo: 0 };
    const countries = new Set();
    for (const a of this.assets.values()) {
      c[a.type] = (c[a.type] || 0) + 1;
      c.total += 1;
      if (a.alarm) c.alerts += 1;
      if (a.demo) c.demo += 1;
      if (a.country) countries.add(a.country);
    }
    c.countries = countries.size;
    return c;
  }

  #stats(force = false) {
    const now = Date.now();
    if (!force && now - this._lastStats < STATS_EVERY_MS) return;
    this._lastStats = now;
    const c = this.counts();
    this.countHistory.push({ t: now, ...c });
    if (this.countHistory.length > 90) this.countHistory.shift();
    this.emit("stats", { counts: c, history: this.countHistory });
  }

  search(q, limit = 8) {
    const s = String(q || "").trim().toLowerCase();
    if (s.length < 2) return [];
    const out = [];
    for (const a of this.assets.values()) {
      const hay = `${a.name || ""} ${a.id} ${a.callsign || ""} ${a.operator || ""} ${a.destination || ""} ${a.country || ""} ${this.info.get(a.id)?.registration || ""}`.toLowerCase();
      if (hay.includes(s)) { out.push(a); if (out.length >= limit) break; }
    }
    return out;
  }

  /* ---------------- controls ---------------- */

  select(id, reason = "ui") {
    if (id && !this.assets.has(id)) return;
    const prev = this.selectedId;
    this.selectedId = id;
    this.emit("selection", { id, prev, reason });
  }

  setType(type, on) { this.types[type] = on; this.emit("types", this.types); }
  setLayer(name, on) { this.layers[name] = on; this.emit("layers", { name, on, layers: this.layers }); }
  setReplay(offsetSec) {
    this.replayOffset = Math.max(0, Math.min(HISTORY_MS / 1000, Number(offsetSec) || 0));
    this.emit("replay", { offset: this.replayOffset });
  }
  setInfo(id, info) { this.info.set(id, info); this.emit("info", { id, info }); }
}

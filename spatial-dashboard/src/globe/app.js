// Globe page bootstrap: shell + Earth + Store + panels, wired together.
import { mountShell, toast } from "../shell.js";
import { getToken } from "../authClient.js";
import { guessBrowserLocation } from "../../lib/places.js";
import { Earth, OVERVIEW_HEIGHT, ATMOSPHERE_HEIGHT } from "./earth.js";
import { Universe } from "./universe.js";
import { Store, HISTORY_MS } from "./store.js";
import { renderAssetCard, loadInfo } from "./assetCard.js";
import { mountCixy } from "./cixy.js";
import * as P from "./panels.js";
import { provisionIfNeeded, showWelcomeCard } from "../apixisWorld.js";
import { colorFor } from "./icons.js";

const params = new URLSearchParams(location.search);
mountShell({ active: params.get("view") === "globe" ? "globe" : params.get("cixy") ? "cixy" : "overview" });

const store = new Store();
const dash = document.querySelector(".gx-dash");
const stageEl = document.getElementById("cesiumContainer");
const universe = new Universe(document.getElementById("universe"));
let earth = null;
let following = null;
let playing = false;
let lastDraw = 0;

const hasWebGL = (() => { try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();

/* ---------------- drawing loop ---------------- */

function drawAll(force = false) {
  if (!earth) return;
  const now = Date.now();
  if (!force && now - lastDraw < 250) return;
  lastDraw = now;
  const sel = store.selectedId;
  for (const [id, a] of store.assets) {
    const show = store.visible(a);
    const pos = show ? store.positionAt(id, now) : null;
    if (!pos) { const m = earth.marks.get(id); if (m) { m.bb.show = false; m.label.show = false; } continue; }
    earth.upsert(a, { ...pos, show: true });
  }
  if (store.layers.trails) {
    if (sel) earth.setTrail(sel, store.trailFor(sel, now), store.assets.get(sel)?.type);
    for (const [id, a] of store.assets) if (a.source !== "air" && store.visible(a)) earth.setTrail(id, store.trailFor(id, now), a.type);
  }
}

function syncRemoved(id) {
  earth?.remove(id);
  earth?.setTrail(id, []);
}

/* ---------------- selection ---------------- */

const assetRoot = document.getElementById("assetCard");
const activityPanel = document.getElementById("activityPanel");
let cixy = null;

function routeFor(id) {
  const info = store.info.get(id);
  const a = store.assets.get(id);
  const pos = store.positionAt(id) || a;
  if (!a || !pos) return null;
  const from = info?.origin?.latitude != null ? info.origin : null;
  const to = info?.destination?.latitude != null ? info.destination : null;
  if (!from && !to) return null;
  return { from, to, via: { latitude: pos.latitude, longitude: pos.longitude }, color: colorFor(a.type) };
}

function paintSelection() {
  const id = store.selectedId;
  earth?.setSelected(id);
  renderAssetCard(assetRoot, { store, earth, following: following === id, onClose: () => store.select(null), onFollow: () => toggleFollow() });
  activityPanel.classList.toggle("hidden", Boolean(id));
  cixy?.setCompact(Boolean(id));
  if (id) {
    const r = routeFor(id);
    if (r) earth?.showRoute(r); else earth?.clearRoute();
    earth?.clearTrails(id);
  } else {
    earth?.release();
    following = null;
  }
  drawAll(true);
}

function toggleFollow() {
  const id = store.selectedId;
  if (!id) return;
  if (following === id) { following = null; earth.release(); }
  else { following = id; earth.follow(id); }
  paintSelection();
}

store.addEventListener("selection", async ({ detail }) => {
  const { id, reason } = detail;
  paintSelection();
  if (!id) return;
  const p = store.positionAt(id);
  if (p && (reason !== "pick" || earth.height() > ATMOSPHERE_HEIGHT * 2.5)) {
    earth.flyTo({ latitude: p.latitude, longitude: p.longitude, height: Math.min(earth.height(), 700_000), pitch: -55, duration: 1.4 });
  }
  const info = await loadInfo(store, id);
  if (store.selectedId === id) paintSelection();
  if (info?.found === false && store.assets.get(id)?.type === "aircraft") { /* unknown airframe: card already shows the live rows */ }
});
store.addEventListener("info", ({ detail }) => { if (detail.id === store.selectedId) paintSelection(); });
store.addEventListener("removed", ({ detail }) => syncRemoved(detail.id));

/* ---------------- store → panels ---------------- */

store.addEventListener("assets", () => { P.renderTracking(store); P.renderTypeBars(store); P.renderMeta(store); drawAll(); if (store.selectedId) renderAssetCard(assetRoot, { store, earth, following: following === store.selectedId, onClose: () => store.select(null), onFollow: toggleFollow }); });
store.addEventListener("feed", () => P.renderActivity(store));
store.addEventListener("stats", () => P.renderTiles(store));
store.addEventListener("meta", () => { P.renderMeta(store); P.renderTracking(store); });
store.addEventListener("types", () => drawAll(true));
store.addEventListener("toast", ({ detail }) => toast(detail.text, detail.kind));
store.addEventListener("replay", () => { P.renderTimeline(store, { playing }); drawAll(true); });
store.addEventListener("layers", async ({ detail }) => {
  const { name, on } = detail;
  if (!earth) return;
  if (name === "weather") { const ok = await earth.setWeather(on); if (!ok) { toast("Weather radar is unavailable right now.", "error"); store.layers.weather = false; P.renderLayers(store); } }
  if (name === "risk") earth.setRisk(on);
  if (name === "labels") earth.setLabels(on);
  if (name === "daynight") earth.setDayNight(on);
  if (name === "trails" && !on) earth.clearTrails();
  if (name === "routes") paintRoutesLayer(on);
  drawAll(true);
});

async function paintRoutesLayer(on) {
  // "Routes" layer: arcs for every aircraft in view with a published route (looked up lazily, capped).
  if (!on) { earth.clearRoute(); if (store.selectedId) { const r = routeFor(store.selectedId); if (r) earth.showRoute(r); } return; }
  const cs = earth.cameraState();
  const inView = [...store.assets.values()].filter((a) => a.type === "aircraft" && a.callsign && cs.bbox && a.latitude >= cs.bbox[0] && a.latitude <= cs.bbox[2] && a.longitude >= cs.bbox[1] && a.longitude <= cs.bbox[3]).slice(0, 40);
  if (!inView.length) { toast("Zoom into a region to draw routes for the aircraft there."); return; }
  earth.clearRoute();
  let drawn = 0;
  for (const a of inView) {
    if (!store.layers.routes) return;
    await loadInfo(store, a.id);
    const r = routeFor(a.id);
    if (r && r.from && r.to) { earth.addRoute(r); drawn += 1; }
  }
  if (!drawn) toast("No published routes for the aircraft in view yet.");
}

/* ---------------- Earth ---------------- */

async function bootEarth() {
  const guess = guessBrowserLocation();
  earth = new Earth({
    container: stageEl,
    onSelect: (id, how, point) => {
      if (id) { store.select(id, "pick"); return; }
      if (store.selectedId) { store.select(null); return; }
      if (point && earth.height() > ATMOSPHERE_HEIGHT * 1.8) earth.flyTo({ latitude: point.latitude, longitude: point.longitude, height: ATMOSPHERE_HEIGHT, pitch: -55 });
    },
    onHover: (id, pos) => P.renderHover(store, id, pos),
    onCamera: (cs) => {
      store.setViewBbox(cs.height < 5_000_000 ? cs.bbox : null);
      universe.nudge(Math.sin((cs.longitude * Math.PI) / 180), Math.sin((cs.latitude * Math.PI) / 180) * 0.5);
      const h = cs.height;
      document.getElementById("stageStatus").textContent = `${cs.latitude.toFixed(2)}°, ${cs.longitude.toFixed(2)}° · ${h >= 1_000_000 ? `${(h / 1_000_000).toFixed(1)} Mm` : `${Math.round(h / 1000)} km`} up`;
      document.getElementById("btnZoomOut").classList.toggle("hidden", h > OVERVIEW_HEIGHT * 0.7);
    },
  });
  await earth.init();
  earth.setView({ latitude: guess.latitude, longitude: guess.longitude, height: OVERVIEW_HEIGHT });
  earth.setRisk(store.layers.risk);
  earth.setLabels(store.layers.labels);
  earth.setDayNight(store.layers.daynight);
  document.getElementById("stageStatus").textContent = "Globe ready · click anywhere to fly in";
  drawAll(true);
  const q = params.get("q");
  if (q) { const hit = store.search(q)[0]; if (hit) store.select(hit.id); }
}

/* ---------------- controls ---------------- */

function wireControls() {
  document.getElementById("btnZoomIn").addEventListener("click", () => earth?.zoomBy(0.5));
  document.getElementById("btnZoomOutStep").addEventListener("click", () => earth?.zoomBy(2));
  document.getElementById("btnZoomOut").addEventListener("click", () => { store.select(null); earth?.zoomOut(); });
  const spinBtn = document.getElementById("btnSpin");
  spinBtn.addEventListener("click", () => { const on = spinBtn.getAttribute("aria-pressed") !== "true"; spinBtn.setAttribute("aria-pressed", String(on)); earth?.setSpin(on); });
  document.getElementById("btnLocate").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Location is not available in this browser.", "error");
    navigator.geolocation.getCurrentPosition(
      (p) => earth?.flyTo({ latitude: p.coords.latitude, longitude: p.coords.longitude, height: ATMOSPHERE_HEIGHT }),
      () => toast("Could not read your location.", "error"), { timeout: 8000 });
  });
  document.getElementById("btnPanels").addEventListener("click", () => { dash.classList.toggle("focus"); setTimeout(() => earth?.viewer.resize(), 50); });
  document.getElementById("btnFullscreen").addEventListener("click", () => { const el = document.querySelector(".gx-stage"); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); });

  const hero = document.getElementById("hero");
  const showHero = !getToken() && !sessionStorage.getItem("gx.hero") && params.get("view") !== "globe";
  P.renderHero({ show: showHero });
  const dismiss = () => { sessionStorage.setItem("gx.hero", "1"); P.renderHero({ show: false }); };
  hero.querySelector("[data-explore]").addEventListener("click", () => { dismiss(); const g = guessBrowserLocation(); earth?.flyTo({ latitude: g.latitude, longitude: g.longitude, height: ATMOSPHERE_HEIGHT }); });
  hero.querySelector("[data-dismiss]").addEventListener("click", dismiss);

  // timeline
  const range = document.getElementById("tlRange");
  range.max = String(HISTORY_MS / 1000);
  range.value = range.max;
  range.addEventListener("input", () => { playing = false; store.setReplay(Number(range.max) - Number(range.value)); });
  document.getElementById("tlLive").addEventListener("click", () => { playing = false; store.setReplay(0); });
  document.getElementById("tlPlay").addEventListener("click", () => {
    if (store.replayOffset === 0) { store.setReplay(300); }
    playing = !playing;
    P.renderTimeline(store, { playing });
  });
  setInterval(() => {
    if (playing && store.replayOffset > 0) { store.setReplay(Math.max(0, store.replayOffset - 10)); if (store.replayOffset === 0) playing = false; }
    P.renderTimeline(store, { playing });
    P.renderClock();
  }, 1000);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && store.selectedId) store.select(null); });
  window.addEventListener("gx:search", ({ detail }) => {
    P.renderSearch(store, detail.q, (id) => store.select(id, "search"));
    if (detail.submit) { const hit = store.search(detail.q)[0]; if (hit) store.select(hit.id, "search"); }
  });
  window.addEventListener("resize", () => earth?.viewer?.resize());
}

/* ---------------- boot ---------------- */

P.renderTracking(store);
P.renderLayers(store);
P.renderTypeBars(store);
P.renderTiles(store);
P.renderActivity(store);
P.renderMeta(store);
P.renderClock();
cixy = mountCixy(document.getElementById("cixyPanel"), { store, onShowAircraft: () => { for (const t of Object.keys(store.types)) store.types[t] = t === "aircraft"; store.emit("types", store.types); P.renderTracking(store); } });
wireControls();
store.start();
setInterval(() => drawAll(), 250);

if (params.get("view") === "globe") dash.classList.add("focus");
if (params.get("cixy")) setTimeout(() => cixy.focus(), 300);

if (hasWebGL) {
  bootEarth().catch((err) => {
    console.error("[earth] failed", err);
    document.getElementById("stageStatus").textContent = "The globe could not start on this device. Live data is still in the panels.";
    toast("The 3D globe could not start here. The panels stay live.", "error");
  });
} else {
  document.getElementById("stageStatus").textContent = "No WebGL on this device. Live data is still in the panels.";
}

setTimeout(async () => {
  if (!getToken()) return;
  const r = await provisionIfNeeded();
  if (r?.ok) showWelcomeCard(r);
}, 1500);

window.geoxis = { store, get earth() { return earth; } };

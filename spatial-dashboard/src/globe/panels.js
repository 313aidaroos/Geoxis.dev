// DOM for the globe page: tracking panel, layers, activity, stat tiles, hero, timeline, hover hint,
// search results. Renders from the Store; earth.js owns everything inside the Cesium canvas.
import { iconSvg, TYPE_LABELS, colorFor } from "./icons.js";

const TYPES = ["aircraft", "vessel", "truck", "container", "drone", "person"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`; };

const $ = (id) => document.getElementById(id);

export function renderTracking(store) {
  const c = store.counts();
  const list = $("trackList");
  const all = Object.values(store.types).every(Boolean);
  const rows = [`<div class="track-row" data-type="all" data-active="${all}">
      <span class="ic" style="color:var(--primary-2)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg></span>
      <span class="nm">All assets</span><span class="ct">${fmt(c.total)}</span>
      <input type="checkbox" class="check" ${all ? "checked" : ""} aria-label="Show all assets" />
    </div>`];
  for (const t of TYPES) {
    rows.push(`<div class="track-row" data-type="${t}" data-active="${store.types[t]}">
      <span class="ic">${iconSvg(t, { size: 16 })}</span>
      <span class="nm">${TYPE_LABELS[t]}<span class="dot" style="background:${colorFor(t)}"></span></span>
      <span class="ct">${fmt(c[t] || 0)}</span>
      <input type="checkbox" class="check" ${store.types[t] ? "checked" : ""} aria-label="Show ${TYPE_LABELS[t]}" />
    </div>`);
  }
  list.innerHTML = rows.join("");
  for (const row of list.querySelectorAll(".track-row")) {
    const box = row.querySelector("input");
    const type = row.dataset.type;
    const apply = (on) => {
      if (type === "all") for (const t of Object.keys(store.types)) store.types[t] = on;
      else store.types[type] = on;
      store.emit("types", store.types);
      renderTracking(store);
    };
    box.addEventListener("click", (e) => { e.stopPropagation(); apply(box.checked); });
    row.addEventListener("click", () => apply(!(type === "all" ? all : store.types[type])));
  }
  const sub = $("trackSub");
  const air = store.meta.air;
  const parts = [];
  parts.push(air.ok || air.stale ? `${fmt(air.count)} aircraft live` : "aircraft feed connecting");
  parts.push(store.meta.ships.demo ? "ships: demo" : `${fmt(store.meta.ships.count)} ships live`);
  sub.textContent = parts.join(" · ");
}

export function renderLayers(store) {
  const defs = [
    ["routes", "Routes", "#76a5ff", "Dashed arcs for every asset with a known route"],
    ["trails", "Movement trails", "#a78bfa", "Where each asset has been this session"],
    ["labels", "Labels", "#e6ecff", "Names next to markers"],
    ["weather", "Weather radar", "#38bdf8", "Live precipitation (RainViewer)"],
    ["risk", "Risk zones", "#f59e0b", "Demo zones around Rotterdam"],
    ["daynight", "Day & night", "#fbbf24", "Real sunlight and city lights"],
  ];
  $("layerList").innerHTML = defs.map(([k, l, col, t]) => `<label class="layer-row" title="${esc(t)}"><span class="sw" style="background:${col};box-shadow:0 0 8px ${col}"></span>${l}<input type="checkbox" class="toggle" data-layer="${k}" ${store.layers[k] ? "checked" : ""} /></label>`).join("");
  for (const input of $("layerList").querySelectorAll("input")) input.addEventListener("change", () => store.setLayer(input.dataset.layer, input.checked));
}

export function renderTypeBars(store) {
  const c = store.counts();
  const max = Math.max(1, ...TYPES.map((t) => c[t] || 0));
  $("typeBars").innerHTML = TYPES.filter((t) => c[t]).map((t) => `<div class="type-bar"><span>${iconSvg(t, { size: 14 })}</span><span><b>${fmt(c[t])}</b> <span class="dim">${TYPE_LABELS[t]}</span></span><span class="bar"><i style="width:${Math.max(3, (c[t] / max) * 100)}%;background:${colorFor(t)};box-shadow:0 0 8px ${colorFor(t)}"></i></span></div>`).join("") || `<div class="empty">Waiting for the first positions…</div>`;
}

function spark(vals, color) {
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const W = 200, H = 34;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `<svg class="spk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W},${H} L0,${H} Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function renderTiles(store) {
  const c = store.counts();
  const h = store.countHistory;
  const series = (k) => h.map((x) => x[k] || 0);
  const delta = (k) => { const s = series(k); if (s.length < 2) return null; const a = s[0], b = s[s.length - 1]; return a ? Math.round(((b - a) / a) * 100) : null; };
  const demoFleet = store.meta.fleet.demo;
  const tiles = [
    { k: "aircraft", label: "Aircraft", sub: "Live ADS-B", color: colorFor("aircraft"), demo: false, icon: "aircraft" },
    { k: "vessel", label: "Ships", sub: store.meta.ships.demo ? "Demo fleet" : "Live AIS", color: colorFor("vessel"), demo: store.meta.ships.demo, icon: "vessel" },
    { k: "truck", label: "Trucks", sub: demoFleet ? "Demo fleet" : "Your fleet", color: colorFor("truck"), demo: demoFleet, icon: "truck" },
    { k: "countries", label: "Countries", sub: "Aircraft registered in", color: "#22d3ee", demo: false, icon: "other" },
    { k: "alerts", label: "Active alerts", sub: "Risk zones & speed", color: "#ef4444", demo: demoFleet, icon: "other", alert: true },
  ];
  $("tiles").innerHTML = tiles.map((t) => {
    const d = delta(t.k);
    return `<div class="panel tile">
      ${t.demo ? '<span class="chip chip-demo badge">DEMO</span>' : ""}
      <div class="th"><span class="ic" style="color:${t.color}">${t.alert ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>' : iconSvg(t.icon, { size: 18, color: t.color })}</span><div><div class="lbl">${t.label}</div><div class="dim" style="font-size:11px">${t.sub}</div></div></div>
      <div class="val">${fmt(c[t.k] || 0)}${d !== null && d !== 0 ? `<span class="delta ${d > 0 ? "ok" : "bad"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%</span>` : ""}</div>
      ${spark(series(t.k), t.color)}
    </div>`;
  }).join("");
}

export function renderActivity(store) {
  for (const el of [$("activity"), $("activityBottom")].filter(Boolean)) renderActivityInto(store, el);
  const alerts = store.feed.filter((e) => e.level === "alert" && Date.now() - e.at < 10 * 60_000).length;
  document.querySelector("[data-bell-dot]")?.classList.toggle("hidden", alerts === 0);
}

function renderActivityInto(store, el) {
  if (!store.feed.length) { el.innerHTML = '<div class="empty">Events appear here as aircraft depart, land, cross borders, and ships stop or get under way.</div>'; return; }
  el.innerHTML = store.feed.slice(0, 40).map((e) => `<button class="act-row" data-level="${e.level}" data-asset="${esc(e.assetId)}" type="button">
    <span class="ic">${iconSvg(e.type, { size: 14 })}</span>
    <span class="tx">${esc(e.text)}</span>
    <span class="t">${ago(e.at)}</span>
  </button>`).join("");
  for (const b of el.querySelectorAll("[data-asset]")) b.addEventListener("click", () => store.select(b.dataset.asset, "activity"));
}

export function renderMeta(store) {
  const c = store.counts();
  $("metaAssets").textContent = `${fmt(c.total)} assets`;
  const air = store.meta.air;
  const feed = $("metaFeed");
  if (air.ok) { feed.textContent = air.authenticated ? "Real-time" : `Aircraft refresh every ${Math.round(air.refreshMs / 60000)} min`; feed.className = ""; }
  else if (air.stale) { feed.textContent = "Aircraft feed: stale"; feed.className = "warn"; }
  else { feed.textContent = "Aircraft feed: connecting…"; feed.className = ""; }
}

export function renderClock() {
  const d = new Date();
  $("metaClock").textContent = `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${d.toISOString().slice(11, 16)} UTC`;
}

export function renderSearch(store, q, onPick) {
  const box = document.querySelector("[data-search-results]");
  if (!box) return;
  const hits = store.search(q);
  if (!q || !hits.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  box.innerHTML = hits.map((a) => `<button type="button" role="option" data-id="${esc(a.id)}">${iconSvg(a.type, { size: 14 })}<span style="min-width:0"><span style="display:block;font-weight:600">${esc(a.name)}</span><span class="sub">${esc([a.callsign && a.callsign !== a.name ? a.callsign : null, a.operator, a.country, a.destination].filter(Boolean).join(" · ") || TYPE_LABELS[a.type])}</span></span></button>`).join("");
  for (const b of box.querySelectorAll("[data-id]")) b.addEventListener("mousedown", (e) => { e.preventDefault(); onPick(b.dataset.id); box.classList.add("hidden"); });
}

export function renderHover(store, id, pos) {
  const el = $("hoverHint");
  if (!id) { el.classList.add("hidden"); return; }
  const a = store.assets.get(id);
  if (!a) { el.classList.add("hidden"); return; }
  const sub = a.type === "aircraft" ? `${a.country || ""} · ${Math.round((a.altitudeMeters || 0) * 3.28084).toLocaleString()} ft · ${Math.round((a.speedMps || 0) * 1.943844)} kt` : a.type === "vessel" ? `${a.vesselType || "Vessel"} · ${((a.speedMps || 0) * 1.943844).toFixed(1)} kn${a.destination ? ` · ${a.destination}` : ""}` : `${TYPE_LABELS[a.type]} · ${Math.round((a.speedMps || 0) * 3.6)} km/h${a.destination ? ` · ${a.destination}` : ""}`;
  el.innerHTML = `<b>${esc(a.name)}</b><span>${esc(sub)}</span>`;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.classList.remove("hidden");
}

export function renderTimeline(store, { playing }) {
  const off = store.replayOffset;
  const live = $("tlLive");
  live.dataset.replay = off > 0 ? "true" : "false";
  live.textContent = off > 0 ? "Replay" : "Live";
  $("tlRange").value = String(1800 - off);
  const m = Math.floor(off / 60), s = Math.round(off % 60);
  $("tlTime").textContent = off > 0 ? `−${m}:${String(s).padStart(2, "0")} · ${new Date(Date.now() - off * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("tlPlay").innerHTML = playing ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l12 8-12 8z"/></svg>';
}

export function renderHero({ show }) {
  $("hero").classList.toggle("hidden", !show);
}

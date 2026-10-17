// Asset Intelligence card: real photo, identity, live rows, mini route map, altitude and speed
// history. Aircraft identity comes from /api/aircraft (adsbdb + Planespotters); ship photos from
// /api/ship-photo (Wikimedia Commons). Everything else is the live frame itself.
import { iconSvg, illustrationSvg, colorFor, TYPE_LABELS } from "./icons.js";

const FT = 3.28084;
const KT = 1.943844;
const TILE = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/1";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (ms) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`; };
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

function mercator(lat, lon) {
  const φ = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return { x: (lon + 180) / 360, y: (1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2 };
}

const CROP = { top: 0.12, span: 0.76 };
function project(lat, lon) {
  const m = mercator(lat, lon);
  return { x: m.x * 100, y: ((m.y - CROP.top) / CROP.span) * 100 };
}

function miniMap(points, { from, to, color }) {
  const tiles = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => `<img src="${TILE}/${y}/${x}" alt="" style="left:${x * 50}%;top:${(y * 0.5 - CROP.top) / CROP.span * 100}%;height:${(0.5 / CROP.span) * 100}%" loading="lazy" />`).join("");
  let path = "";
  if (points.length > 1) {
    path = points.map((p, i) => { const q = project(p.latitude, p.longitude); return `${i ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(" ");
  }
  const pin = (p, cls, r) => { if (!p) return ""; const q = project(p.latitude, p.longitude); return `<circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${r}" class="${cls}" />`; };
  const tag = (p, text) => { if (!p || !text) return ""; const q = project(p.latitude, p.longitude); return `<span class="tag" style="left:${q.x.toFixed(2)}%;top:${q.y.toFixed(2)}%">${esc(text)}</span>`; };
  const now = points[points.length - 1];
  return `<div class="minimap">
    <div class="tiles">${tiles}</div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      ${path ? `<path d="${path}" fill="none" stroke="${color}" stroke-width=".9" stroke-dasharray="1.6 1.2" vector-effect="non-scaling-stroke" opacity=".95" />` : ""}
      ${pin(from, "", 1.4)}${pin(to, "", 1.4)}
      ${now ? `<circle cx="${project(now.latitude, now.longitude).x.toFixed(2)}" cy="${project(now.latitude, now.longitude).y.toFixed(2)}" r="2.6" fill="${color}" stroke="#fff" stroke-width=".6" vector-effect="non-scaling-stroke"><animate attributeName="r" values="2.2;3.2;2.2" dur="1.8s" repeatCount="indefinite"/></circle>` : ""}
    </svg>
    ${tag(from, from?.iata || from?.name)}${tag(to, to?.iata || to?.name)}
  </div>`;
}

function sparkline(samples, { label, unit, color, format = (v) => fmt(v) }) {
  const vals = samples.map((s) => s.v).filter(Number.isFinite);
  if (vals.length < 2) return `<div class="spark"><div class="hd"><span>${label}</span><b>${vals.length ? format(vals[0]) + " " + unit : "—"}</b></div><div class="empty" style="padding:4px 0">Collecting history…</div></div>`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300, H = 54, P = 4;
  const pts = samples.map((s, i) => [P + (i / (samples.length - 1)) * (W - 2 * P), H - P - ((s.v - min) / span) * (H - 2 * P)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const last = vals[vals.length - 1];
  return `<div class="spark" data-spark>
    <div class="hd"><span>${label} <span class="dim">· last 30 min</span></span><b data-spark-val>${format(last)} ${unit}</b></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label} over the last 30 minutes">
      <path d="${area}" fill="${color}" opacity=".12"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3" fill="${color}" stroke="#0b1226" stroke-width="1.5"/>
      <line data-cursor x1="0" x2="0" y1="0" y2="${H}" stroke="#fff" stroke-opacity=".35" style="display:none"/>
    </svg>
  </div>`;
}

export function renderAssetCard(root, { store, earth, onClose, onFollow, following }) {
  const id = store.selectedId;
  const a = store.assets.get(id);
  if (!a) { root.innerHTML = ""; root.classList.add("hidden"); return; }
  root.classList.remove("hidden");
  const info = store.info.get(id) || null;
  const color = colorFor(a.type);
  const typeLabel = TYPE_LABELS[a.type] || "Asset";
  const isAir = a.type === "aircraft";
  const isShip = a.type === "vessel";
  const live = store.positionAt(id) || a;
  const title = isAir ? (info?.flightNumber || a.callsign || a.name) : a.name;
  const subtitle = isAir
    ? [info?.airline?.name || info?.operator, info?.typeName, info?.registration ? `(${info.registration})` : null].filter(Boolean).join(" · ") || (a.country ? `Registered ${a.country}` : "Identifying…")
    : isShip ? [a.vesselType || "Vessel", a.operator, a.imo ? `IMO ${a.imo}` : a.mmsi ? `MMSI ${a.mmsi}` : null].filter(Boolean).join(" · ")
    : [typeLabel.replace(/s$/, ""), a.operator].filter(Boolean).join(" · ");

  const status = isAir ? (a.onGround ? "On ground" : "In flight") : isShip ? (a.navStatus || ((a.speedMps || 0) > 0.5 ? "Under way" : "Stopped")) : a.alarm ? a.alarmReason : (a.speedMps || 0) > 0.5 ? "Moving" : "Stopped";
  const statusClass = a.alarm ? "bad" : /flight|under way|moving/i.test(status) ? "ok" : "";
  const photo = info?.photo || a.photo || null;
  const rows = [];
  const row = (k, v, ic) => { if (v !== null && v !== undefined && v !== "") rows.push(`<dt>${ic ? iconSvg(ic, { size: 12 }) : ""}${k}</dt><dd>${v}</dd>`); };
  row("Status", `<span class="${statusClass}">${esc(status)}</span>`);
  if (isAir) {
    row("Callsign", esc(a.callsign || "—"));
    if (info?.airline?.name) row("Airline", esc(info.airline.name));
    if (info?.typeName) row("Aircraft", esc(info.typeName));
    if (info?.registration) row("Registration", esc(info.registration));
    row("Altitude", `${fmt(a.altitudeMeters * FT)} ft`);
    row("Speed", `${fmt(a.speedMps * KT)} kt · ${fmt(a.speedMps * 3.6)} km/h`);
    row("Heading", `${fmt(a.heading)}°`);
    if (Number.isFinite(a.verticalRateMps) && Math.abs(a.verticalRateMps) > 0.5) row("Vertical", `${a.verticalRateMps > 0 ? "↑" : "↓"} ${fmt(Math.abs(a.verticalRateMps) * FT * 60)} ft/min`);
    if (info?.origin) row("From", esc([info.origin.city || info.origin.name, info.origin.iata ? `(${info.origin.iata})` : ""].filter(Boolean).join(" ")));
    if (info?.destination) row("To", esc([info.destination.city || info.destination.name, info.destination.iata ? `(${info.destination.iata})` : ""].filter(Boolean).join(" ")));
    if (a.country) row("Country", esc(a.country));
  } else if (isShip) {
    if (a.mmsi) row("MMSI", esc(a.mmsi));
    if (a.imo) row("IMO", esc(a.imo));
    row("Speed", `${fmt(a.speedMps * KT, 1)} kn`);
    row("Heading", `${fmt(a.heading)}°`);
    if (a.destination) row("Destination", esc(a.destination));
    if (a.cargo) row("Cargo", esc(a.cargo));
  } else {
    row("Speed", `${fmt(a.speedMps * 3.6)} km/h`);
    row("Heading", `${fmt(a.heading)}°`);
    if (a.destination) row("Destination", esc(a.destination));
    if (a.cargo) row("Cargo", esc(a.cargo));
    if (Number.isFinite(a.odometerKm)) row("Distance run", `${fmt(a.odometerKm, 1)} km`);
  }
  row("Position", `${live.latitude.toFixed(3)}°, ${live.longitude.toFixed(3)}°`);
  row("Last update", esc(ago(a.at - (a.ageSec || 0) * 1000)));

  const trail = store.trailFor(id).slice(-80).map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
  const mapPts = [...(info?.origin?.latitude != null ? [info.origin] : []), ...(trail.length ? trail : [live]), ...(info?.destination?.latitude != null ? [info.destination] : [])];
  const hist = store.trailFor(id);
  const altSamples = hist.map((s) => ({ t: s.t, v: s.altitudeMeters * FT }));
  const spdSamples = hist.map((s) => ({ t: s.t, v: s.speedMps * (isAir || isShip ? KT : 3.6) }));

  root.innerHTML = `
    <div class="panel asset-card">
      <div class="photo">
        ${photo?.src ? `<img src="${esc(photo.src)}" alt="${esc(title)}" referrerpolicy="no-referrer" />${photo.credit ? `<span class="credit">${esc(photo.credit)}</span>` : ""}` : `<div class="fallback" style="color:${color}">${illustrationSvg(a.type)}</div>`}
        <div style="position:absolute;left:10px;top:10px;display:flex;gap:6px">
          <span class="chip ${a.demo ? "chip-demo" : "chip-live"}">${a.demo ? "DEMO" : "LIVE"}</span>
          <span class="chip">${iconSvg(a.type, { size: 11 })} ${esc(typeLabel.replace(/s$/, "").replace("Field team", "Field team"))}</span>
        </div>
        <button class="gx-icon-btn" data-close aria-label="Close" style="position:absolute;right:10px;top:10px;width:30px;height:30px">✕</button>
      </div>
      <div class="ident">
        <div style="min-width:0;flex:1">
          <div class="ti">${esc(title)}</div>
          <div class="su">${esc(subtitle)}</div>
        </div>
      </div>
      <div class="panel-body" style="display:grid;gap:12px">
        <dl class="kv">${rows.join("")}</dl>
        ${miniMap(mapPts, { from: info?.origin?.latitude != null ? info.origin : null, to: info?.destination?.latitude != null ? info.destination : null, color })}
        <div class="spark-wrap">
          ${sparkline(altSamples, { label: isAir ? "Altitude" : "Altitude", unit: "ft", color: "#a78bfa" })}
          ${sparkline(spdSamples, { label: "Speed", unit: isAir || isShip ? "kt" : "km/h", color: "#38bdf8" })}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" data-fly>View on globe</button>
        <button class="btn btn-ghost btn-sm" data-follow aria-pressed="${following ? "true" : "false"}">${following ? "Stop following" : "Track"}</button>
        ${isAir && photo?.link ? `<a class="btn btn-ghost btn-sm" href="${esc(photo.link)}" target="_blank" rel="noopener">Photo ↗</a>` : ""}
      </div>
    </div>`;

  root.querySelector("[data-close]").addEventListener("click", onClose);
  root.querySelector("[data-fly]").addEventListener("click", () => {
    const p = store.positionAt(id);
    if (p) earth.flyTo({ latitude: p.latitude, longitude: p.longitude, height: 380_000, pitch: -50, duration: 1.6 });
  });
  root.querySelector("[data-follow]").addEventListener("click", onFollow);
  for (const sp of root.querySelectorAll("[data-spark]")) {
    const svg = sp.querySelector("svg");
    const cursor = sp.querySelector("[data-cursor]");
    const val = sp.querySelector("[data-spark-val]");
    const base = val.textContent;
    const samples = sp.nextElementSibling === null ? spdSamples : altSamples;
    const unit = base.split(" ").pop();
    svg.addEventListener("mousemove", (e) => {
      const r = svg.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const i = Math.round(f * (samples.length - 1));
      const s = samples[i];
      if (!s) return;
      cursor.style.display = "";
      cursor.setAttribute("x1", (4 + f * 292).toFixed(1));
      cursor.setAttribute("x2", (4 + f * 292).toFixed(1));
      val.textContent = `${fmt(s.v)} ${unit} · ${new Date(s.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    });
    svg.addEventListener("mouseleave", () => { cursor.style.display = "none"; val.textContent = base; });
  }
}

/** Fetch identity + photo once per asset. Resolves when the store has it. */
export async function loadInfo(store, id) {
  const a = store.assets.get(id);
  if (!a || store.info.has(id)) return store.info.get(id) || null;
  store.info.set(id, { pending: true });
  try {
    if (a.type === "aircraft" && a.hex) {
      const res = await fetch(`/api/aircraft?hex=${encodeURIComponent(a.hex)}${a.callsign ? `&callsign=${encodeURIComponent(a.callsign)}` : ""}`);
      const info = res.ok ? await res.json() : { ok: false };
      store.setInfo(id, info);
      return info;
    }
    if (a.type === "vessel" && !a.demo && a.name) {
      const res = await fetch(`/api/ship-photo?name=${encodeURIComponent(a.name)}`);
      const p = res.ok ? await res.json() : { found: false };
      const info = { ok: true, photo: p.found ? { src: p.src, link: p.link, credit: p.credit } : null };
      store.setInfo(id, info);
      return info;
    }
    store.setInfo(id, { ok: true });
    return store.info.get(id);
  } catch {
    store.setInfo(id, { ok: false });
    return null;
  }
}

// Asset glyphs: one SVG path per type, rendered as glowing billboards on the globe and as inline
// icons in the panels. Colors live in theme.css (--c-*) and here (Cesium needs the hex).

export const TYPE_COLORS = Object.freeze({
  aircraft: "#9d8cff",
  vessel: "#38bdf8",
  truck: "#22c55e",
  container: "#fb923c",
  drone: "#f472b6",
  person: "#fbbf24",
  train: "#22d3ee",
  other: "#94a3b8",
});

export const TYPE_LABELS = Object.freeze({
  aircraft: "Aircraft", vessel: "Ships", truck: "Trucks", container: "Freight", drone: "Drones", person: "Field teams", train: "Rail", other: "Other",
});

/** 24×24 paths, north-up (aircraft nose points up so heading rotation works). */
const PATHS = {
  aircraft: "M12 2c.6 0 1 .5 1.1 1.2l.3 6.3 7.6 4.5v1.8l-7.6-2.3-.3 4.8 2.1 1.5v1.3L12 20.4l-3.2.7v-1.3l2.1-1.5-.3-4.8L3 15.8V14l7.6-4.5.3-6.3C11 2.5 11.4 2 12 2z",
  vessel: "M4 15h16l-2 4H6l-2-4zm2-2V9h3V6h6v3h3v4H6zm5-6h2v2h-2z",
  truck: "M3 7h10v8H3V7zm10 3h4l3 3v2h-7v-5zM6 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  container: "M3 7l9-4 9 4v10l-9 4-9-4V7zm9 4v8l7-3V8l-7 3zm-7 5l6 2.6V11L5 8v8z",
  drone: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM4 4h3l3 3-2 2-3-3V4zm13 0h3v3l-3 3-2-2 3-3-1-1zM4 20v-3l3-3 2 2-3 3H4zm16 0h-3l-3-3 2-2 3 3v2z",
  person: "M12 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm-7 17c0-4 3-7 7-7s7 3 7 7H5z",
  train: "M6 3h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2l1.5 3h-2l-1-2h-9l-1 2h-2L6 17a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 3v5h10V6H7zm1 8a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 8 14zm8 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z",
  other: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
};

export function normalizeType(t) {
  const k = String(t || "").toLowerCase();
  return PATHS[k] ? k : "other";
}

export function colorFor(type) {
  return TYPE_COLORS[normalizeType(type)] || TYPE_COLORS.other;
}

/** Inline SVG for panels. */
export function iconSvg(type, { size = 16, color } = {}) {
  const k = normalizeType(type);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color || colorFor(k)}" aria-hidden="true"><path d="${PATHS[k]}"/></svg>`;
}

const cache = new Map();

/**
 * Billboard image (data URI). Glow halo + glyph. `state`: "normal" | "selected" | "alarm".
 * 64×64 so the glyph stays crisp when scaled.
 */
export function markerImage(type, state = "normal") {
  const k = normalizeType(type);
  const key = `${k}|${state}`;
  if (cache.has(key)) return cache.get(key);
  const color = colorFor(k);
  const ring = state === "selected" ? "#ffffff" : state === "alarm" ? "#f59e0b" : "none";
  const ringW = state === "normal" ? 0 : 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset=".55" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="32" r="30" fill="url(#g)"/>
    ${ringW ? `<circle cx="32" cy="32" r="19" fill="none" stroke="${ring}" stroke-width="${ringW}" opacity=".95"/>` : ""}
    <circle cx="32" cy="32" r="15" fill="#060b1a" opacity=".55"/>
    <g transform="translate(20 20) scale(1)"><path d="${PATHS[k]}" fill="${color}" stroke="#060b1a" stroke-width=".6"/></g>
  </svg>`.replace(/\s+/g, " ").trim();
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}

/** Big illustration used when no photo exists. */
export function illustrationSvg(type) {
  const k = normalizeType(type);
  return `<svg viewBox="0 0 24 24" fill="${colorFor(k)}" aria-hidden="true" style="color:${colorFor(k)}"><path d="${PATHS[k]}"/></svg>`;
}

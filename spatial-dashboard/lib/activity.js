// Recent Activity: real events derived from successive live snapshots. Pure, browser-safe.
// An event: { id, at, assetId, type, kind, text, level }  level: info | alert | ok

const FEET = 3.28084;

function label(a) {
  return a?.name || a?.id || "asset";
}

/** Compare the previous frame of one asset with the next one. Returns 0..n events. */
export function eventsForAsset(prev, next, at = Date.now()) {
  const out = [];
  const push = (kind, text, level = "info") => out.push({ id: `${next?.id || prev?.id}:${kind}:${at}`, at, assetId: next?.id || prev?.id, type: next?.type || prev?.type, kind, text, level });
  if (!prev && next) {
    if (next.type === "aircraft") push("appeared", `${label(next)} entered coverage${next.country ? ` over ${next.country}` : ""}`);
    else if (next.type === "vessel") push("appeared", `${label(next)} reported position${next.destination ? ` · bound for ${next.destination}` : ""}`);
    else push("appeared", `${label(next)} came online`);
    return out;
  }
  if (prev && !next) {
    push("lost", `${label(prev)} went quiet`, "info");
    return out;
  }
  if (!prev || !next) return out;
  if (next.type === "aircraft") {
    if (prev.onGround && !next.onGround) push("departed", `${label(next)} departed${next.country ? ` · ${next.country}` : ""}`, "ok");
    if (!prev.onGround && next.onGround) push("landed", `${label(next)} landed${next.country ? ` · ${next.country}` : ""}`, "ok");
    if (prev.country && next.country && prev.country !== next.country) push("border", `${label(next)} entered ${next.country} airspace`);
    const dAlt = (next.altitudeMeters || 0) - (prev.altitudeMeters || 0);
    if (!next.onGround && Math.abs(dAlt) >= 2000) push("altitude", `${label(next)} ${dAlt > 0 ? "climbed" : "descended"} to ${Math.round((next.altitudeMeters || 0) * FEET / 1000)}k ft`);
  }
  if (next.type === "vessel") {
    if ((prev.speedMps || 0) > 1 && (next.speedMps || 0) <= 0.3) push("stopped", `${label(next)} stopped${next.navStatus ? ` · ${next.navStatus}` : ""}`);
    if ((prev.speedMps || 0) <= 0.3 && (next.speedMps || 0) > 1) push("underway", `${label(next)} under way${next.destination ? ` to ${next.destination}` : ""}`, "ok");
    if (!prev.destination && next.destination) push("destination", `${label(next)} bound for ${next.destination}`);
  }
  if (!prev.alarm && next.alarm) push("alarm", `${label(next)}: ${next.alarmReason || "alert"}`, "alert");
  if (prev.alarm && !next.alarm) push("clear", `${label(next)} alert cleared`, "ok");
  return out;
}

/**
 * Diff two snapshots (Map or array of frames). Capped so a 10k-aircraft refresh does not flood the
 * feed: at most `max` events, alerts first.
 */
export function diffSnapshots(prevList, nextList, { at = Date.now(), max = 12 } = {}) {
  const prev = prevList instanceof Map ? prevList : new Map((prevList || []).map((a) => [a.id, a]));
  const next = nextList instanceof Map ? nextList : new Map((nextList || []).map((a) => [a.id, a]));
  const events = [];
  for (const [id, n] of next) events.push(...eventsForAsset(prev.get(id) || null, n, at));
  if (prev.size) for (const [id, p] of prev) if (!next.has(id)) events.push(...eventsForAsset(p, null, at));
  const rank = { alert: 0, ok: 1, info: 2 };
  events.sort((a, b) => rank[a.level] - rank[b.level]);
  return events.slice(0, max);
}

/** Keep a rolling feed. Newest first, de-duplicated by kind+asset within 60 s. */
export function appendEvents(feed, events, limit = 60) {
  const out = [...feed];
  for (const e of events) {
    const dup = out.find((x) => x.assetId === e.assetId && x.kind === e.kind && Math.abs(x.at - e.at) < 60_000);
    if (dup) continue;
    out.unshift(e);
  }
  return out.slice(0, limit);
}

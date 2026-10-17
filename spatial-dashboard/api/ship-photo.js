// GET /api/ship-photo?name=MSC%20AURORA → best-effort photo of a vessel from Wikimedia Commons.
// Keyless. { found, src, link, credit } or { found: false }. CDN-cached for a day.
import { sendJson } from "../lib/supabaseServer.js";

const COMMONS = "https://commons.wikimedia.org/w/api.php";

export function parseCommons(payload) {
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  for (const page of Object.values(pages)) {
    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
    const src = info?.thumburl || info?.url;
    if (!src || !/\.(jpe?g|png|webp)$/i.test(src)) continue;
    return { found: true, src, link: info.descriptionurl || null, credit: "Photo via Wikimedia Commons" };
  }
  return null;
}

export async function shipPhoto(name, fetchImpl = fetch) {
  const clean = String(name || "").trim().replace(/[^\w\s.-]/g, "").slice(0, 60);
  if (clean.length < 3) return { found: false };
  const url = `${COMMONS}?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=${encodeURIComponent(`${clean} ship`)}&prop=imageinfo&iiprop=url&iiurlwidth=720`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Geoxis/1.0 (live globe)" }, signal: controller.signal });
    if (!res.ok) return { found: false };
    return parseCommons(await res.json()) || { found: false };
  } catch {
    return { found: false };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const url = new URL(req.url, "https://local.invalid");
  const body = await shipPhoto(url.searchParams.get("name"));
  return sendJson(res, 200, body, { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300, s-maxage=86400" });
}

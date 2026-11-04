// GET /api/ships?bbox=s,w,n,e → live AIS vessels heard in that box over a few seconds.
// demo: true (empty list) when AISSTREAM_API_KEY is missing; the globe then shows the demo vessels.
import { aisKey, collectAis, parseBbox } from "../lib/ais.js";
import { sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const url = new URL(req.url, "https://local.invalid");
  const bbox = parseBbox(url.searchParams.get("bbox"));
  // Round the box so the CDN key is stable while the camera drifts.
  const key = bbox.flat().map((v) => Math.round(v)).join(",");
  const body = await collectAis({ apiKey: aisKey(), bbox });
  return sendJson(res, 200, { ...body, bbox: key, fetchedAt: Date.now() }, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": body.demo ? "public, s-maxage=600" : "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
  });
}

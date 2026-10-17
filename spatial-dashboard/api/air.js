// GET /api/air → worldwide live aircraft (OpenSky ADS-B). Public, CDN-cached for the refresh window
// so one upstream fetch serves every visitor. See lib/airTraffic.js for the quota notes.
import { worldAircraft, openSkyConfig } from "../lib/airTraffic.js";
import { sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.end();
    return;
  }
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const cfg = openSkyConfig();
  const body = await worldAircraft();
  const edge = Math.max(30, Math.floor(cfg.refreshMs / 1000));
  return sendJson(res, 200, body, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=0, s-maxage=${edge}, stale-while-revalidate=120`,
  });
}

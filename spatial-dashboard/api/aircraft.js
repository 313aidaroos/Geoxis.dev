// GET /api/aircraft?hex=4ca87c&callsign=RYR1234 → identity, route and photo for one aircraft.
// Keyless upstreams (adsbdb, Planespotters). CDN-cached for a day per hex+callsign.
import { aircraftInfo, normalizeHex } from "../lib/aircraftInfo.js";
import { sendJson } from "../lib/supabaseServer.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
  const url = new URL(req.url, "https://local.invalid");
  const hex = normalizeHex(url.searchParams.get("hex"));
  if (!hex) return sendJson(res, 400, { error: "invalid_hex" });
  const body = await aircraftInfo({ hex, callsign: url.searchParams.get("callsign") });
  return sendJson(res, 200, body, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": body.found ? "public, max-age=300, s-maxage=86400" : "public, max-age=60, s-maxage=600",
  });
}

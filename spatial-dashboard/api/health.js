// 2026-10-14 (Geoxis Lead / Grok): GET /api/health. Booleans only, never env values.
import { sendJson } from "../lib/supabaseServer.js";
import { healthReport } from "../lib/health.js";

export default function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  return sendJson(res, 200, healthReport(), { "Cache-Control": "no-store" });
}

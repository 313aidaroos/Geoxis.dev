import { authContext, listSupportTickets, updateSupportTicket, sendJson, envConfig } from "../../lib/supabaseServer.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  try {
    const ctx = await authContext(req);
    if (!ctx) return sendJson(res, 401, { error: "not_authenticated" });
    if (!ctx.admin) return sendJson(res, 403, { error: "owner_only" });

    if (req.method === "GET") {
      const tickets = await listSupportTickets();
      return sendJson(res, 200, { tickets }, { "Cache-Control": "no-store" });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.id) return sendJson(res, 400, { error: "missing_id" });
      // Only `status` is a column on support_tickets; a `reply` field used to be forwarded and 400ed in PostgREST.
      const status = String(body.status || "");
      if (!["open", "triaged", "closed"].includes(status)) return sendJson(res, 400, { error: "invalid_status" });
      const updated = await updateSupportTicket(body.id, { status });
      return sendJson(res, 200, { ticket: updated }, { "Cache-Control": "no-store" });
    }

    return sendJson(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    return sendJson(res, err.status || 500, { error: "admin_support_failed", message: String(err?.message || err) });
  }
}

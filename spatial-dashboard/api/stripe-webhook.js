// 2026-10-14 (Geoxis Lead / Grok): Stripe webhook. Signature-verified (STRIPE_WEBHOOK_SECRET).
// Writes a permanent ledger/receipt row (geoxis_payments, sql/006) and an entitlement. Idempotent on event id.
import { sendJson, upsert } from "../lib/supabaseServer.js";
import { rowsFromEvent, verifyStripeSignature } from "../lib/stripe.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { error: "not_configured" });
  const raw = await rawBody(req);
  if (!verifyStripeSignature(raw, req.headers["stripe-signature"], secret)) {
    return sendJson(res, 400, { error: "bad_signature" });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "invalid_json" }); }
  const rows = rowsFromEvent(event);
  if (!rows) return sendJson(res, 200, { received: true, ignored: true });
  try {
    await upsert("geoxis_payments", rows.payment, "stripe_event_id");
    await upsert("entitlements", rows.entitlement, "reservation_id");
  } catch {
    return sendJson(res, 500, { error: "write_failed" }); // Stripe retries
  }
  return sendJson(res, 200, { received: true });
}

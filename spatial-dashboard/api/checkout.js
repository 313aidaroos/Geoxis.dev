// 2026-10-14 (Geoxis Lead / Grok): card checkout (Stripe Checkout Session). DRAFT, inert without env.
// GET  -> { enabled, skus } so the pages can show or hide "Pay by card".
// POST -> { url } to redirect to Stripe. Body: { sku, quantity?, trackingNumber? }.
import { authContext, sendJson } from "../lib/supabaseServer.js";
import { checkoutParams, stripeStatus } from "../lib/stripe.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method === "GET") return sendJson(res, 200, stripeStatus());
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!stripeStatus().enabled) {
    return sendJson(res, 503, { error: "card_not_configured", message: "Card checkout is not set up yet. Pay with Ixis. Nothing was charged." });
  }
  const ctx = await authContext(req).catch(() => null);
  if (!ctx) return sendJson(res, 401, { error: "not_authenticated", message: "Sign in with Apixis to pay." });
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { error: "invalid_json" }); }
  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
  const built = checkoutParams({
    sku: body.sku,
    quantity: body.quantity,
    trackingNumber: body.trackingNumber,
    userId: ctx.user.id,
    tenantId: ctx.tenant.id,
    email: ctx.user.email,
    appUrl,
  });
  if (!built.ok) return sendJson(res, built.error === "card_not_configured" ? 503 : 400, built);
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(built.fields).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.url) return sendJson(res, 502, { error: "stripe_error", message: "Card checkout could not start. Nothing was charged." });
  return sendJson(res, 200, { url: data.url });
}

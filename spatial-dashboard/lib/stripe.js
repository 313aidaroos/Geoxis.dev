// 2026-10-14 (Geoxis Lead / Grok): Stripe card checkout, alongside Ixis. DRAFT.
// One Stripe account (Apixis Dev LLC). Every Geoxis payment carries metadata product=geoxis.
// Price ids come from env only (NEEDS-AWAD: create the prices in Stripe and set these names):
//   STRIPE_PRICE_GEOXIS_OBJECT_MONTHLY  recurring $5/month, quantity = things (min 3)
//   STRIPE_PRICE_GEOXIS_REPORT          one-time $10
//   STRIPE_PRICE_GEOXIS_PACKAGE         one-time $1
// Plus STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Missing env = card checkout stays off.
import crypto from "node:crypto";
import { PRODUCT_OBJECT, PRODUCT_PACKAGE, PRODUCT_REPORT, quoteObjects } from "./pricing.js";

export const STRIPE_SKUS = Object.freeze({
  [PRODUCT_OBJECT]: { env: "STRIPE_PRICE_GEOXIS_OBJECT_MONTHLY", mode: "subscription" },
  [PRODUCT_REPORT]: { env: "STRIPE_PRICE_GEOXIS_REPORT", mode: "payment" },
  [PRODUCT_PACKAGE]: { env: "STRIPE_PRICE_GEOXIS_PACKAGE", mode: "payment" },
});

export function stripeStatus(env = process.env) {
  const base = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  const skus = {};
  for (const [sku, { env: name }] of Object.entries(STRIPE_SKUS)) skus[sku] = base && Boolean(env[name]);
  return { enabled: base && Object.values(skus).some(Boolean), skus };
}

/** Build form fields for POST /v1/checkout/sessions. Returns {ok:false,...} on bad input. */
export function checkoutParams({ sku, quantity = 1, userId, tenantId, email, trackingNumber, appUrl }, env = process.env) {
  const def = STRIPE_SKUS[sku];
  if (!def) return { ok: false, error: "unknown_product" };
  const price = env[def.env];
  if (!price || !env.STRIPE_SECRET_KEY) return { ok: false, error: "card_not_configured" };
  let qty = 1;
  if (sku === PRODUCT_OBJECT) {
    const q = quoteObjects(quantity);
    if (!q.ok) return q;
    qty = q.objects;
  }
  const meta = { product: "geoxis", sku, user_id: userId, tenant_id: tenantId, quantity: String(qty) };
  if (trackingNumber) meta.tracking_number = String(trackingNumber).slice(0, 64);
  const f = {
    mode: def.mode,
    "line_items[0][price]": price,
    "line_items[0][quantity]": String(qty),
    success_url: `${appUrl}/pricing?card=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?card=cancelled`,
    client_reference_id: userId,
  };
  if (email) f.customer_email = email;
  for (const [k, v] of Object.entries(meta)) {
    f[`metadata[${k}]`] = v;
    if (def.mode === "subscription") f[`subscription_data[metadata][${k}]`] = v;
    else f[`payment_intent_data[metadata][${k}]`] = v;
  }
  if (def.mode === "payment") f.invoice_creation_enabled = "true"; // permanent Stripe receipt/invoice
  return { ok: true, fields: f, quantity: qty };
}

/** Verify a Stripe-Signature header (v1, HMAC-SHA256) with a 5-minute tolerance. */
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  let t = null;
  const sigs = [];
  for (const p of String(header).split(",")) {
    const [k, v] = p.split("=");
    if (k === "t") t = Number(v);
    if (k === "v1") sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/** Map a verified checkout.session.completed / invoice.paid event to rows. Null when not ours. */
export function rowsFromEvent(event) {
  const obj = event?.data?.object || {};
  const meta = obj.metadata || obj.subscription_details?.metadata || obj.parent?.subscription_details?.metadata || {};
  if (meta.product !== "geoxis") return null;
  const sku = meta.sku;
  if (!STRIPE_SKUS[sku] || !meta.tenant_id) return null;
  const isInvoice = event.type === "invoice.paid";
  if (!isInvoice && event.type !== "checkout.session.completed") return null;
  if (!isInvoice && obj.payment_status !== "paid") return null;
  const qty = Number(meta.quantity) || 1;
  const amount = Number(isInvoice ? obj.amount_paid : obj.amount_total) || 0;
  const ref = obj.id;
  const periodEnd = obj.lines?.data?.[0]?.period?.end;
  const expires = sku === PRODUCT_OBJECT
    ? new Date((periodEnd ? periodEnd * 1000 : Date.now() + 30 * 864e5) + 3 * 864e5).toISOString()
    : null;
  return {
    payment: {
      stripe_event_id: event.id,
      stripe_object_id: ref,
      product: "geoxis",
      sku,
      tenant_id: meta.tenant_id,
      user_id: meta.user_id || null,
      quantity: qty,
      amount_cents: amount,
      currency: obj.currency || "usd",
      receipt_url: obj.hosted_invoice_url || null,
      raw_type: event.type,
    },
    entitlement: {
      tenant_id: meta.tenant_id,
      user_id: meta.user_id || null,
      owner: meta.user_id || "stripe",
      product_key: sku,
      reservation_id: `stripe-${ref}`,
      receipt_id: ref,
      status: "active",
      object_limit: sku === PRODUCT_OBJECT ? qty : null,
      expires_at: expires,
    },
  };
}

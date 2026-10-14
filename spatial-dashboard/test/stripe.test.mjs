import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { checkoutParams, rowsFromEvent, stripeStatus, verifyStripeSignature } from "../lib/stripe.js";

const env = { STRIPE_SECRET_KEY: "x", STRIPE_WEBHOOK_SECRET: "w", STRIPE_PRICE_GEOXIS_OBJECT_MONTHLY: "price_o", STRIPE_PRICE_GEOXIS_REPORT: "price_r" };

test("card checkout is off when env is missing", () => {
  assert.equal(stripeStatus({}).enabled, false);
  assert.equal(checkoutParams({ sku: "geoxis.export.report", userId: "u", tenantId: "t", appUrl: "https://a" }, {}).error, "card_not_configured");
  assert.equal(stripeStatus(env).skus["geoxis.track.package"], false);
});

test("per-thing plan is a subscription with min 3 and product=geoxis", () => {
  assert.equal(checkoutParams({ sku: "geoxis.tracking.object", quantity: 2, userId: "u", tenantId: "t", appUrl: "https://a" }, env).error, "below_minimum");
  const r = checkoutParams({ sku: "geoxis.tracking.object", quantity: 4, userId: "u", tenantId: "t", appUrl: "https://a" }, env);
  assert.equal(r.fields.mode, "subscription");
  assert.equal(r.fields["line_items[0][quantity]"], "4");
  assert.equal(r.fields["subscription_data[metadata][product]"], "geoxis");
  const rep = checkoutParams({ sku: "geoxis.export.report", userId: "u", tenantId: "t", appUrl: "https://a" }, env);
  assert.equal(rep.fields.mode, "payment");
  assert.equal(rep.fields["payment_intent_data[metadata][sku]"], "geoxis.export.report");
});

test("webhook signature verification", () => {
  const body = '{"a":1}', t = 1000;
  const sig = crypto.createHmac("sha256", "w").update(`${t}.${body}`).digest("hex");
  assert.ok(verifyStripeSignature(body, `t=${t},v1=${sig}`, "w", t));
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${sig}`, "other", t));
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${sig}`, "w", t + 1000));
});

test("only paid geoxis events become rows", () => {
  const ev = { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", amount_total: 1000, metadata: { product: "geoxis", sku: "geoxis.export.report", tenant_id: "t", user_id: "u" } } } };
  const r = rowsFromEvent(ev);
  assert.equal(r.payment.amount_cents, 1000);
  assert.equal(r.entitlement.reservation_id, "stripe-cs_1");
  assert.equal(rowsFromEvent({ ...ev, data: { object: { ...ev.data.object, metadata: { product: "other" } } } }), null);
});

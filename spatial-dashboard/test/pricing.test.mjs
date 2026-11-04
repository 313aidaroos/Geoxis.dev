import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_SALES_AT,
  MIN_OBJECTS,
  OBJECT_PRICE_IXIS,
  PRODUCT_OBJECT,
  PRODUCT_TRIAL,
  WALLET_PRICES,
  activeObjectLimit,
  objectChargePlan,
  objectIdempotencyKey,
  quoteObjects,
  splitByObjectLimit,
} from "../lib/pricing.js";

const USER = "11111111-2222-3333-4444-555555555555";
const ATTEMPT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("object price: $5 and 500 Ixis, 3 minimum, 200+ is sales", () => {
  const tooSmall = quoteObjects(2);
  assert.equal(tooSmall.ok, false);
  assert.equal(tooSmall.error, "below_minimum");
  assert.equal(tooSmall.usd, 15);
  assert.equal(tooSmall.ixis, 1500);

  const min = quoteObjects(3);
  assert.equal(min.ok, true);
  assert.equal(min.usd, 15);
  assert.equal(min.ixis, 1500);
  assert.equal(min.ixisEach, OBJECT_PRICE_IXIS);
  assert.equal(min.productKey, PRODUCT_OBJECT);

  const ten = quoteObjects("10");
  assert.equal(ten.objects, 10);
  assert.equal(ten.usd, 50);
  assert.equal(ten.ixis, 5000);

  const top = quoteObjects(CONTACT_SALES_AT - 1);
  assert.equal(top.ok, true);
  assert.equal(top.ixis, 199 * 500);

  const sales = quoteObjects(200);
  assert.equal(sales.ok, false);
  assert.equal(sales.error, "contact_sales");
  assert.equal(quoteObjects(1.5).error, "invalid_count");
  assert.equal(quoteObjects("nope").error, "invalid_count");
  assert.equal(MIN_OBJECTS, 3);
});

test("object charge plan: one 500 Ixis hold per thing, same attempt repeats the same keys", () => {
  const plan = objectChargePlan(USER, ATTEMPT, 4);
  assert.equal(plan.ok, true);
  assert.equal(plan.charges.length, 4);
  assert.equal(plan.totalIxis, 2000);
  assert.ok(plan.charges.every((c) => c.ixis === 500 && c.productKey === PRODUCT_OBJECT));
  const keys = plan.charges.map((c) => c.idempotencyKey);
  assert.equal(new Set(keys).size, 4);
  assert.deepEqual(keys, objectChargePlan(USER, ATTEMPT, 4).charges.map((c) => c.idempotencyKey));
  for (const key of keys) assert.match(key, /^[\x21-\x7E]{8,80}$/);
  assert.equal(objectIdempotencyKey(USER, "short", 0), null);
  assert.equal(WALLET_PRICES[PRODUCT_OBJECT], 500);
  assert.equal(WALLET_PRICES["geoxis.track.package"], 100);
  assert.equal(WALLET_PRICES["geoxis.export.report"], 1000);
});

test("object limit: trial, paid rows, legacy plans, and expired rows", () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  const rows = [
    { product_key: PRODUCT_TRIAL, status: "active", expires_at: "2026-10-20T00:00:00Z" },
    { product_key: PRODUCT_OBJECT, status: "active", expires_at: "2026-11-05T00:00:00Z", object_limit: 1 },
    { product_key: PRODUCT_OBJECT, status: "active", expires_at: "2026-11-05T00:00:00Z", object_limit: 1 },
    { product_key: "geoxis.tracking.small", status: "active", expires_at: "2026-11-05T00:00:00Z" },
    { product_key: "geoxis.tracking.medium", status: "active", expires_at: "2026-10-01T00:00:00Z" },
    { product_key: "geoxis.export.report", status: "active", expires_at: null },
  ];
  assert.equal(activeObjectLimit(rows, now), 1 + 1 + 1 + 10);
  assert.equal(activeObjectLimit([{ product_key: PRODUCT_OBJECT, status: "active", expires_at: null }], now), 1);
});

test("object limit gate keeps updates and blocks new things past the cap", () => {
  const none = splitByObjectLimit({ limit: 0, existingIds: ["a"], incomingIds: ["a", "b"] });
  assert.deepEqual(none.allowedIds, []);
  assert.equal(none.rejected.length, 2);

  const gate = splitByObjectLimit({ limit: 2, existingIds: ["a"], incomingIds: ["a", "b", "c", "b"] });
  assert.deepEqual(gate.allowedIds, ["a", "b"]);
  assert.deepEqual(gate.rejected, [{ id: "c", error: "object_limit" }]);
  assert.equal(gate.used, 2);

  const fresh = splitByObjectLimit({ limit: 3, existingIds: [], incomingIds: ["a", "a", "b"] });
  assert.deepEqual(fresh.allowedIds, ["a", "b"]);
  assert.equal(fresh.used, 2);
});

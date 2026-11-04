import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { lookupDecision, parseShip24Payload, plainStatus, samplePackage } from "../lib/tracking.js";
import { packageIdempotencyKey } from "../lib/packageKey.js";
import { attachCoordinates, geocodePlace, resetGeocodeCache } from "../lib/geocode.js";
import { FREE_PACKAGE_LOOKUPS } from "../lib/pricing.js";

test("three free package lookups, then $1, and a paid package stays open", () => {
  assert.equal(FREE_PACKAGE_LOOKUPS, 3);
  const first = lookupDecision({ freeNumbers: [], trackingNumber: "1Z999AA10123456784" });
  assert.equal(first.allow, true);
  assert.equal(first.reason, "free");
  assert.equal(first.recordFree, true);

  const again = lookupDecision({ freeNumbers: ["1Z999AA10123456784"], trackingNumber: "1z999aa10123456784" });
  assert.equal(again.reason, "free_repeat");
  assert.equal(again.recordFree, false);

  const fourth = lookupDecision({
    freeNumbers: ["AAA1111111", "BBB2222222", "CCC3333333"],
    trackingNumber: "1Z999AA10123456784",
  });
  assert.equal(fourth.allow, false);
  assert.equal(fourth.reason, "payment_required");
  assert.equal(fourth.priceUsd, 1);
  assert.equal(fourth.priceIxis, 100);

  const paid = lookupDecision({
    freeNumbers: ["AAA1111111", "BBB2222222", "CCC3333333"],
    trackingNumber: "1Z999AA10123456784",
    unlocked: true,
  });
  assert.equal(paid.allow, true);
  assert.equal(paid.reason, "unlocked");
  assert.equal(lookupDecision({ trackingNumber: "SAMPLE" }).reason, "sample");
});

test("package idempotency key is stable for the same person and number", () => {
  const a = packageIdempotencyKey("Awad@apixis.dev", "1Z 999 AA1 0123 4567 84");
  const b = packageIdempotencyKey("awad@apixis.dev", "1Z999AA10123456784");
  const c = packageIdempotencyKey("awad@apixis.dev", "449044304137");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^gxpkg[0-9a-f]{40}$/);
});

test("Ship24 events become a timeline in time order with plain status words", () => {
  assert.equal(plainStatus("out_for_delivery", "ignored"), "Out for delivery");
  assert.equal(plainStatus("delivery_delivered", "Delivered, Front Door"), "Delivered");
  const parsed = parseShip24Payload({
    data: {
      trackings: [{
        tracker: { trackingNumber: "1z999aa10123456784", courierCode: ["ups"] },
        shipment: { statusMilestone: "in_transit" },
        events: [
          { occurrenceDatetime: "2026-10-04T11:00:00", status: "In transit", statusMilestone: "in_transit", location: "Memphis, TN, US", order: 2 },
          { occurrenceDatetime: "2026-10-02T09:00:00", status: "Label created", statusMilestone: "info_received", location: { city: "Louisville", state: "KY", countryCode: "US" }, order: 1 },
        ],
      }],
    },
  });
  assert.equal(parsed.trackingNumber, "1Z999AA10123456784");
  assert.equal(parsed.stops[0].place, "Louisville, KY, US");
  assert.equal(parsed.stops[0].status, "Label created");
  assert.equal(parsed.stops[1].status, "On the way");
  assert.equal(parsed.delivered, false);
  const delivered = parseShip24Payload({ events: [{ statusMilestone: "delivered", location: "Chicago, IL", occurrenceDatetime: "2026-10-05T16:00:00" }] });
  assert.equal(delivered.delivered, true);
  assert.equal(delivered.stops[0].status, "Delivered");
});

test("sample package is labeled and has pins", () => {
  const sample = samplePackage();
  assert.equal(sample.sample, true);
  assert.match(sample.label, /not a real shipment/i);
  assert.ok(sample.stops.every((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)));
  assert.equal(sample.stops.at(-1).status, "Out for delivery");
});

test("geocoder uses the city and skips a failed lookup", async () => {
  resetGeocodeCache();
  const fetchImpl = async (url) => {
    assert.match(url, /name=Chicago/);
    return { ok: true, json: async () => ({ results: [{ latitude: 41.88, longitude: -87.63 }] }) };
  };
  const point = await geocodePlace("Chicago, IL, US", fetchImpl);
  assert.deepEqual(point, { latitude: 41.88, longitude: -87.63 });
  const stops = await attachCoordinates([{ place: "Chicago, IL, US", status: "On the way" }], fetchImpl);
  assert.equal(stops[0].latitude, 41.88);
  const missed = await attachCoordinates([{ place: "Nowhereville", status: "Update" }], async () => ({ ok: false, json: async () => ({}) }));
  assert.equal(missed[0].latitude, null);
});

function mockReq(body, ip) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = "POST";
  req.headers = { "x-forwarded-for": ip, "content-type": "application/json" };
  req.socket = { remoteAddress: ip };
  return req;
}

function mockRes() {
  let done;
  const finished = new Promise((resolve) => { done = resolve; });
  return {
    statusCode: 0,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(payload) { this.json = JSON.parse(payload); done(); },
    finished,
  };
}

test("track route: sample works with no key, and a real number explains the missing key", async () => {
  const previous = process.env.SHIP24_API_KEY;
  delete process.env.SHIP24_API_KEY;
  try {
    const { default: handler } = await import("../api/track.js");
    const sampleRes = mockRes();
    await handler(mockReq({ trackingNumber: "SAMPLE" }, "203.0.113.10"), sampleRes);
    await sampleRes.finished;
    assert.equal(sampleRes.statusCode, 200);
    assert.equal(sampleRes.json.sample, true);
    assert.match(sampleRes.json.label, /not a real shipment/i);

    const missing = mockRes();
    await handler(mockReq({ trackingNumber: "1Z999AA10123456784" }, "203.0.113.11"), missing);
    await missing.finished;
    assert.equal(missing.statusCode, 503);
    assert.equal(missing.json.error, "tracking_not_configured");
    assert.match(missing.json.message, /SHIP24_API_KEY/);
    assert.equal(missing.json.carrier.id, "ups");
  } finally {
    if (previous === undefined) delete process.env.SHIP24_API_KEY;
    else process.env.SHIP24_API_KEY = previous;
  }
});

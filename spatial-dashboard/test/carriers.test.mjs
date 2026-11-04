import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCarrier, normalizeTrackingNumber, validTrackingNumber } from "../lib/carriers.js";

test("carrier detection for the main shippers and a few others", () => {
  assert.equal(detectCarrier("1Z999AA10123456784").id, "ups");
  assert.equal(detectCarrier("1Z999AA10123456784").ship24Code, "ups");
  assert.equal(detectCarrier("1Z 999 AA1 0123 4567 84").id, "ups");
  assert.equal(detectCarrier("9400111899223856921846").id, "usps");
  assert.equal(detectCarrier("9400111899223856921846").ship24Code, "us-post");
  assert.equal(detectCarrier("EE123456789US").id, "usps");
  assert.equal(detectCarrier("449044304137").id, "fedex");
  assert.equal(detectCarrier("9612019012345678901234").id, "fedex");
  assert.equal(detectCarrier("4815162342").id, "dhl");
  assert.equal(detectCarrier("JD014600006501234567").id, "dhl");
  assert.equal(detectCarrier("TBA123456789012").id, "amazon");
  assert.equal(detectCarrier("C12345678901234").id, "ontrac");
  assert.equal(detectCarrier("AA123456789GB").id, "royal-mail");
  assert.equal(detectCarrier("LX123456789CN").id, "china-post");
  assert.equal(detectCarrier("AB12CD").id, "unknown");
  assert.equal(detectCarrier("").confidence, "none");
});

test("tracking numbers: trim, uppercase, reject blanks and dummy strings", () => {
  assert.equal(normalizeTrackingNumber(" 1z999aa10123456784 "), "1Z999AA10123456784");
  assert.equal(validTrackingNumber("1Z999AA10123456784"), true);
  assert.equal(validTrackingNumber("SAMPLE"), true);
  assert.equal(validTrackingNumber("123456789"), false);
  assert.equal(validTrackingNumber("TEST12345"), false);
  assert.equal(validTrackingNumber("no"), false);
  assert.equal(validTrackingNumber("bad number!"), false);
});

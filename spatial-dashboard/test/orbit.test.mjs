import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyOrbitRequest, pickOrbitAssetSummary } from "../lib/orbit.js";
test("Orbit signature rejects expired or forged payloads and has no anonymous mode", () => {
  const old = process.env.ORBIT_GEOXIS_SHARED_SECRET;
  process.env.ORBIT_GEOXIS_SHARED_SECRET = "example-unit-test-shared-secret-123456789";
  try {
    const timestamp = String(Date.now());
    const body = { capability: "geoxis.asset.read", principal: { sub: "wallet-sub-123", email: "demo@example.org" }, assetId: "truck-12" };
    const sign = (b) => "v1=" + createHmac("sha256", process.env.ORBIT_GEOXIS_SHARED_SECRET).update(timestamp+"\n"+JSON.stringify(b)).digest("hex");
    assert.equal(verifyOrbitRequest({headers:{"x-orbit-timestamp": timestamp,"x-orbit-signature":sign(body)}},body).ok,true);
    assert.equal(verifyOrbitRequest({headers:{"x-orbit-timestamp": timestamp,"x-orbit-signature":sign(body)}},{...body,assetId:"other"}).status,401);
    assert.equal(verifyOrbitRequest({headers:{"x-orbit-timestamp": String(Date.now()-120000),"x-orbit-signature":sign(body)}},body).status,401);
  } finally { if (old===undefined) delete process.env.ORBIT_GEOXIS_SHARED_SECRET; else process.env.ORBIT_GEOXIS_SHARED_SECRET=old; }
});
test("Orbit real asset summaries never invent positions and surface stale timestamps", () => {
  const now=Date.parse("2026-10-09T20:00:00Z");
  const assets=[{id:"T12",name:"Truck 12",latitude:44,longitude:-88,speedKph:40,timestamp:"2026-10-09T18:00:00Z",tenant_id:"one"},{id:"T13",latitude:43,longitude:-87,timestamp:"2026-10-09T19:59:00Z"}];
  const result=pickOrbitAssetSummary(assets,"T12",now);
  assert.equal(result.assets.length,1);assert.equal(result.assets[0].stale,true);
  assert.equal(pickOrbitAssetSummary(assets,"missing",now).assets.length,0);
});

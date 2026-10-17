import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/health.js";
import { healthReport } from "../lib/health.js";

const NOW = new Date("2026-10-14T21:00:00.000Z");

const SECRET_ENV = {
  SUPABASE_URL: "https://db.example.test",
  SUPABASE_ANON_KEY: "anon-secret-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret-value",
  ANTHROPIC_API_KEY: "sk-ant-secret-value",
  STRIPE_SECRET_KEY: "sk_test_secret_value",
  STRIPE_WEBHOOK_SECRET: "whsec_secret_value",
  STRIPE_PRICE_GEOXIS_PACKAGE: "price_secret_value",
  SHIP24_API_KEY: "ship24-secret-value",
  VERCEL_GIT_COMMIT_SHA: "abc1234def",
};

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.body = payload; },
  };
}

test("health report is booleans and a commit only, never secret values", () => {
  const body = healthReport(SECRET_ENV, NOW);
  assert.equal(body.ok, true);
  assert.equal(body.time, "2026-10-14T21:00:00.000Z");
  assert.equal(body.version, "abc1234def");
  assert.deepEqual(body.checks, {
    supabase: true,
    cixyConfigured: true,
    stripeConfigured: true,
    ship24Configured: true,
    openskyAuthenticated: false,
    aisConfigured: false,
  });
  for (const value of Object.values(body.checks)) assert.equal(typeof value, "boolean");
  const serialized = JSON.stringify(body);
  for (const secret of [
    "anon-secret-value",
    "service-secret-value",
    "sk-ant-secret-value",
    "sk_test_secret_value",
    "whsec_secret_value",
    "price_secret_value",
    "ship24-secret-value",
    "https://db.example.test",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("health report omits version and reports every check false when env is empty", () => {
  const body = healthReport({}, NOW);
  assert.equal(body.ok, true);
  assert.equal("version" in body, false);
  assert.deepEqual(body.checks, {
    supabase: false,
    cixyConfigured: false,
    stripeConfigured: false,
    ship24Configured: false,
    openskyAuthenticated: false,
    aisConfigured: false,
  });
});

test("health handler is GET only", () => {
  const denied = mockRes();
  handler({ method: "POST" }, denied);
  assert.equal(denied.statusCode, 405);
  const ok = mockRes();
  handler({ method: "GET" }, ok);
  assert.equal(ok.statusCode, 200);
  const body = JSON.parse(ok.body);
  assert.equal(typeof body.ok, "boolean");
  assert.equal(typeof body.time, "string");
  assert.equal(typeof body.checks.supabase, "boolean");
  assert.equal(typeof body.checks.cixyConfigured, "boolean");
  assert.equal(typeof body.checks.stripeConfigured, "boolean");
  assert.equal(typeof body.checks.ship24Configured, "boolean");
  assert.equal(ok.headers["Cache-Control"], "no-store");
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string" || value.length < 8) continue;
    if (!/KEY|SECRET|TOKEN|URL|ANON|SERVICE|PASSWORD/i.test(key)) continue;
    assert.equal(ok.body.includes(value), false);
  }
});

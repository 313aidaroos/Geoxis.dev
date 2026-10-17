// 2026-10-14 (Geoxis Lead / Grok): liveness for monitors. Booleans only — never echo env values.
import { envConfig } from "./supabaseServer.js";
import { stripeStatus } from "./stripe.js";
import { ship24Key } from "./ship24.js";
import { openSkyConfig } from "./airTraffic.js";
import { aisKey } from "./ais.js";

const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

export function healthReport(env = process.env, now = new Date()) {
  const cfg = envConfig(env);
  const checks = {
    supabase: Boolean(cfg.url && cfg.anonKey && cfg.serviceKey),
    cixyConfigured: Boolean(cfg.anthropicKey),
    stripeConfigured: Boolean(stripeStatus(env).enabled),
    ship24Configured: Boolean(ship24Key(env)),
    // 2026-10-17 (Claude, redesign): live feeds. Aircraft work without a key (slower refresh); ships need AISStream.
    openskyAuthenticated: Boolean(openSkyConfig(env).authenticated),
    aisConfigured: Boolean(aisKey(env)),
  };
  const sha = String(env.VERCEL_GIT_COMMIT_SHA || "").trim();
  const body = {
    ok: true,
    time: now.toISOString(),
    checks,
  };
  if (COMMIT_SHA.test(sha)) body.version = sha;
  return body;
}

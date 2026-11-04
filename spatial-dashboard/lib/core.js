import { CIXY_CORE } from "./apixis-cixy.js";
/**
 * Pure helpers shared by the Vercel functions. No network here so they
 * are unit-testable with node:test.
 */

export const OWNER_EMAIL = "awad@apixis.dev";
export const SUPPORT_INBOX = "geoxis@apixis.dev";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(input) {
  const v = String(input ?? "").trim().toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

// Owner admin allowlist (Awad's rule, 2026-10-04 Grok): both owner emails are the Geoxis owner/admin.
// ADMIN_EMAILS (comma-separated, Vercel env) adds to this fallback list. Case-insensitive.
export const OWNER_ADMIN_EMAILS = Object.freeze(["alaidaroosawad@gmail.com", OWNER_EMAIL]);

export function ownerAdminEmails(env = globalThis.process?.env?.ADMIN_EMAILS) {
  const list = new Set(OWNER_ADMIN_EMAILS);
  for (const raw of String(env ?? "").split(",")) {
    const e = normalizeEmail(raw);
    if (e) list.add(e);
  }
  return list;
}

export function isOwner(email) {
  const e = normalizeEmail(email);
  return Boolean(e) && ownerAdminEmails().has(e);
}

/** Tenant slug from email domain; personal mailboxes get a per-user tenant. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com",
]);

export function tenantSlugFor(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const [local, domain] = e.split("@");
  if (PERSONAL_DOMAINS.has(domain)) {
    return `${local}-${domain}`.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
  }
  return domain.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
}

/** Drop any asset that does not belong to the caller's tenant. */
export function filterAssetsForTenant(assets, tenantId) {
  if (!tenantId) return [];
  return (assets ?? []).filter((a) => a && a.tenant_id === tenantId);
}

/** Validate a support ticket body from a form or JSON post. */
export function validateTicket(input) {
  const email = normalizeEmail(input?.email);
  const subject = String(input?.subject ?? "").trim();
  const message = String(input?.message ?? "").trim();
  const errors = {};
  if (!email) errors.email = "Enter a valid email.";
  if (subject.length < 3 || subject.length > 140) errors.subject = "Subject must be 3–140 characters.";
  if (message.length < 10 || message.length > 5000) errors.message = "Message must be 10–5000 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    ticket: {
      email,
      subject,
      message,
      inbox: SUPPORT_INBOX,
      route_to: OWNER_EMAIL,
      tenant_id: input?.tenant_id ?? null,
      status: "open",
    },
  };
}

/** Bearer token from an incoming request, or null. */
export function bearerToken(req) {
  const h = req?.headers?.authorization ?? req?.headers?.Authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1] : null;
}

/** Cixy model: AI_MODEL env (Vercel) or the default below. */
export function cixyModel(env = globalThis.process?.env) {
  const m = String(env?.AI_MODEL ?? "").trim();
  return m || "claude-sonnet-5";
}

/** Build the Anthropic request for Cixy or a 503 descriptor when the key is missing. */
export function cixyRequest({ apiKey, messages, context }) {
  if (!apiKey) return { status: 503, error: "cixy_unavailable" };
  const clean = (messages ?? [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return { status: 400, error: "last_message_must_be_user" };
  }
  return {
    status: 200,
    body: {
      // 2026-10-04 (Grok): claude-sonnet-4-20250514 was retired 2026-06-15, so Cixy always fell back to "resting".
      model: cixyModel(),
      max_tokens: 700,
      system: cixySystemPrompt(context),
      messages: clean,
    },
  };
}

export function cixySystemPrompt(context = {}) {
  const lines = [
    CIXY_CORE,
    "",
    "## Your role on Geoxis",
    "Geoxis is a live map of everything a company has moving in the real world, on a 3D globe. Never fabricate data or invent positions.",
    "",
    "## Expertise",
    "You are a deep expert in fleet telematics, GPS/AIS/ADS-B feeds, geofencing, ETA logic, WGS84 coordinates, map tiles, and logistics operations.",
    "Answer as a senior operations analyst: lead with the answer, use plain units (knots for vessels, km/h for road), name assets by display name and ID.",
    "Only cite assets present in the live context below. If nothing matches, say so and suggest the next operational step.",
    "Never invent positions, ETAs, or alarms. If data is missing, say what feed would provide it.",
    "Assets marked simulated or source=geoxis-fleet are a demonstration, not real company telemetry. Say so when discussing them. Stale positions are last known observations, not current locations.",
  ];
  if (context?.tenant) lines.push(`Tenant: ${context.tenant}`);
  if (Array.isArray(context?.assets) && context.assets.length) {
    lines.push("", "## Live assets");
    for (const a of context.assets.slice(0, 40)) {
      lines.push(
        `- ${a.name ?? a.id} (${a.id}) ${a.type ?? "asset"} at ${a.latitude}, ${a.longitude}; heading ${a.heading}°; ${a.speedKph ?? "?"} km/h; source=${a.source || "unknown"}; simulated=${Boolean(a.simulated)}; stale=${Boolean(a.stale)}; observed=${a.timestamp || "unknown"}${a.alarm ? `; ALARM: ${a.alarmReason}` : ""}`,
      );
    }
  } else {
    lines.push("", "## Live assets", "(none in view)");
  }
  return lines.join("\n");
}

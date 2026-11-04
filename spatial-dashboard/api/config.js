import { OWNER_EMAIL, OWNER_ADMIN_EMAILS, SUPPORT_INBOX } from "../lib/core.js";
import { envConfig, sendJson } from "../lib/supabaseServer.js";

export default function handler(req, res) {
  const cfg = envConfig();
  sendJson(res, 200, {
    supabaseUrl: cfg.url,
    supabaseAnonKey: cfg.anonKey,
    ownerEmail: OWNER_EMAIL,
    // 2026-10-14 (Geoxis Lead / Grok): both master admins, not just one. Only the built-in owners, never ADMIN_EMAILS.
    ownerEmails: [...OWNER_ADMIN_EMAILS],
    supportInbox: SUPPORT_INBOX,
    cixyAvailable: Boolean(cfg.anthropicKey),
  }, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
}

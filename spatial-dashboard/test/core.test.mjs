import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  isOwner,
  tenantSlugFor,
  filterAssetsForTenant,
  validateTicket,
  bearerToken,
  cixyRequest,
  cixySystemPrompt,
  OWNER_EMAIL,
  SUPPORT_INBOX,
} from "../lib/core.js";

test("owner is awad@apixis.dev only", () => {
  assert.equal(OWNER_EMAIL, "awad@apixis.dev");
  assert.equal(isOwner(" Awad@Apixis.dev "), true);
  assert.equal(isOwner("someone@apixis.dev"), false);
  assert.equal(isOwner(null), false);
});

test("normalizeEmail accepts valid, rejects junk", () => {
  assert.equal(normalizeEmail("Ops@Example.COM"), "ops@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("a@b.c"), null);
});

test("tenant slug: company domain shared, personal mailbox per-user", () => {
  assert.equal(tenantSlugFor("ops@northwind.io"), "northwind-io");
  assert.equal(tenantSlugFor("dispatch@northwind.io"), "northwind-io");
  assert.equal(tenantSlugFor("jane.doe@gmail.com"), "jane-doe-gmail-com");
  assert.notEqual(tenantSlugFor("a@gmail.com"), tenantSlugFor("b@gmail.com"));
  assert.equal(tenantSlugFor("bad"), null);
});

test("tenant isolation: assets from other tenants never leak", () => {
  const rows = [
    { id: "1", tenant_id: "t1" },
    { id: "2", tenant_id: "t2" },
    { id: "3", tenant_id: "t1" },
    { id: "4" },
  ];
  assert.deepEqual(filterAssetsForTenant(rows, "t1").map((r) => r.id), ["1", "3"]);
  assert.deepEqual(filterAssetsForTenant(rows, "t2").map((r) => r.id), ["2"]);
  assert.deepEqual(filterAssetsForTenant(rows, null), []);
  assert.deepEqual(filterAssetsForTenant(rows, "nope"), []);
});

test("support ticket routes geoxis@ inbox to owner", () => {
  const r = validateTicket({ email: "cust@acme.com", subject: "Truck missing", message: "Truck 4471 vanished from the map since 9am." });
  assert.equal(r.ok, true);
  assert.equal(r.ticket.inbox, SUPPORT_INBOX);
  assert.equal(r.ticket.inbox, "geoxis@apixis.dev");
  assert.equal(r.ticket.route_to, OWNER_EMAIL);
  assert.equal(r.ticket.status, "open");
});

test("support ticket rejects bad input", () => {
  const r = validateTicket({ email: "x", subject: "hi", message: "short" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.email);
  assert.ok(r.errors.subject);
  assert.ok(r.errors.message);
});

test("bearerToken parses Authorization header", () => {
  assert.equal(bearerToken({ headers: { authorization: "Bearer abc.def" } }), "abc.def");
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({ headers: { authorization: "Basic zzz" } }), null);
});

test("cixy returns 503 without ANTHROPIC key, never a fake answer", () => {
  const r = cixyRequest({ apiKey: "", messages: [{ role: "user", content: "hi" }] });
  assert.equal(r.status, 503);
  assert.equal(r.body, undefined);
});

test("cixy builds a grounded Anthropic request with the key", () => {
  const r = cixyRequest({
    apiKey: "k",
    messages: [{ role: "assistant", content: "x" }, { role: "user", content: "Where is Truck 4471?" }],
    context: { tenant: "acme", assets: [{ id: "GX-TR-4471", name: "Truck 4471", type: "truck", latitude: 51.9, longitude: 4.1, heading: 90, speedKph: 72 }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.messages.at(-1).role, "user");
  assert.match(r.body.system, /Cixy/);
  assert.match(r.body.system, /Truck 4471 \(GX-TR-4471\)/);
  assert.match(r.body.system, /Tenant: acme/);
});

test("cixy rejects when last message is not from user", () => {
  const r = cixyRequest({ apiKey: "k", messages: [{ role: "assistant", content: "x" }] });
  assert.equal(r.status, 400);
});

test("cixy system prompt says none in view when empty", () => {
  assert.match(cixySystemPrompt({}), /none in view/);
});

test("cixy core: Arab culture line, no Muslim/religious greetings/phrases/rules (Awad's lock, 2026-10-04)", () => {
  const prompt = cixySystemPrompt({ tenant: "test", assets: [] });
  assert.match(prompt, /draws on Arab culture: hospitality, courtesy, patience/);
  assert.doesNotMatch(prompt, /salam|as-salamu|alaykum/i);
  assert.doesNotMatch(prompt, /insha'?allah|alhamdulillah|bismillah|masha'?allah/i);
  assert.doesNotMatch(prompt, /halal|haram|alcohol|pork|interest-based|gambling|prayer/i);
  assert.doesNotMatch(prompt, /religious ruling|scholar|fatwa/i);
  assert.doesNotMatch(prompt, /Muslim|Islam/i);
  assert.match(prompt, /never fabricate/);
});

test("cixy merges shared core with domain expertise", () => {
  const prompt = cixySystemPrompt({ tenant: "acme", assets: [{ id: "T1", name: "Truck 1", latitude: 51.9, longitude: 4.1 }] });
  assert.match(prompt, /You are Cixy/);
  assert.match(prompt, /fleet telematics/);
  assert.match(prompt, /Truck 1/);
  assert.match(prompt, /Tenant: acme/);
});

test("cixy Geoxis role: Ominixis rename, card+Ixis family rule, planned prices / redemption closed (2026-10-19 + 2026-11-05)", () => {
  const prompt = cixySystemPrompt({});
  assert.match(prompt, /Nexxis is now called Ominixis — same product, the marketplace and transaction layer for the Apixis AI economy\./);
  assert.match(prompt, /Every Ixis site takes card AND Ixis, and lets you buy Ixis right on the site through Apixis Wallet\. Where card checkout or on-site Ixis top-up isn't working on this site yet, it's coming soon\./);
  assert.match(prompt, /planned prices with coming-soon actions/);
  assert.match(prompt, /Ixis redemption is closed/);
});


test("cixy model: AI_MODEL env or claude-sonnet-5, never the retired sonnet-4 snapshot", async () => {
  const { cixyModel } = await import("../lib/core.js");
  assert.equal(cixyModel({}), "claude-sonnet-5");
  assert.equal(cixyModel({ AI_MODEL: " claude-sonnet-5-5 " }), "claude-sonnet-5-5");
  const r = cixyRequest({ apiKey: "k", messages: [{ role: "user", content: "hi" }] });
  assert.notEqual(r.body.model, "claude-sonnet-4-20250514");
});

test("owner admin allowlist: both owner emails, case-insensitive, ADMIN_EMAILS adds", async () => {
  const { ownerAdminEmails } = await import("../lib/core.js");
  assert.equal(isOwner("ALAIDAROOSAWAD@gmail.com"), true);
  assert.equal(isOwner(" awad@apixis.dev "), true);
  const list = ownerAdminEmails("Ops@Example.com, bad");
  assert.ok(list.has("ops@example.com"));
  assert.ok(!list.has("bad"));
  assert.ok(list.has("alaidaroosawad@gmail.com"));
});

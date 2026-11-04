// Pricing Awad locked on 2026-10-06. 100 Ixis = $1.
// The Wallet charges whatever Ixis amount is on the catalog SKU, and it has no quantity field.
// Geoxis therefore redeems the per-object SKU once per object (500 Ixis each) and the
// package SKU once per tracking number (100 Ixis). A quote check refuses to charge if the
// catalog price does not match these amounts.

export const IXIS_PER_USD = 100;
export const OBJECT_PRICE_USD = 5;
export const OBJECT_PRICE_IXIS = 500;
export const MIN_OBJECTS = 3;
export const CONTACT_SALES_AT = 200;
export const TRIAL_DAYS = 14;
export const TRIAL_OBJECTS = 1;
export const REPORT_PRICE_USD = 10;
export const REPORT_PRICE_IXIS = 1000;
export const PACKAGE_PRICE_USD = 1;
export const PACKAGE_PRICE_IXIS = 100;
export const FREE_PACKAGE_LOOKUPS = 3;
export const SALES_EMAIL = "awad@apixis.dev";

export const PRODUCT_OBJECT = "geoxis.tracking.object";
export const PRODUCT_TRIAL = "geoxis.tracking.trial";
export const PRODUCT_REPORT = "geoxis.export.report";
export const PRODUCT_PACKAGE = "geoxis.track.package";

/** Old fleet bundles. Still recognized for seats already sold; not sold anymore. */
export const LEGACY_OBJECT_LIMITS = Object.freeze({
  "geoxis.tracking.small": 10,
  "geoxis.tracking.medium": 50,
  "geoxis.tracking.large": 200,
});

export const RETIRED_PRODUCT_KEYS = Object.freeze(Object.keys(LEGACY_OBJECT_LIMITS));

/** Ixis the Wallet catalog must charge for each SKU. */
export const WALLET_PRICES = Object.freeze({
  [PRODUCT_OBJECT]: OBJECT_PRICE_IXIS,
  [PRODUCT_REPORT]: REPORT_PRICE_IXIS,
  [PRODUCT_PACKAGE]: PACKAGE_PRICE_IXIS,
});

export function quoteObjects(count) {
  const n = typeof count === "string" && String(count).trim() !== "" ? Number(count) : count;
  if (!Number.isInteger(n)) {
    return { ok: false, error: "invalid_count", message: "Enter a whole number of things to follow." };
  }
  if (n < MIN_OBJECTS) {
    return {
      ok: false,
      error: "below_minimum",
      min: MIN_OBJECTS,
      usd: MIN_OBJECTS * OBJECT_PRICE_USD,
      ixis: MIN_OBJECTS * OBJECT_PRICE_IXIS,
      message: "The smallest plan is 3 things, $15 a month (1,500 Ixis).",
    };
  }
  if (n >= CONTACT_SALES_AT) {
    return {
      ok: false,
      error: "contact_sales",
      message: "For 200 or more things, contact sales.",
    };
  }
  return {
    ok: true,
    objects: n,
    usd: n * OBJECT_PRICE_USD,
    ixis: n * OBJECT_PRICE_IXIS,
    ixisEach: OBJECT_PRICE_IXIS,
    productKey: PRODUCT_OBJECT,
  };
}

/** One Wallet hold per object. Same attempt id always rebuilds the same keys (a retry is not a second charge). */
export function objectIdempotencyKey(userId, attemptId, index) {
  const user = String(userId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const attempt = String(attemptId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  if (user.length < 4 || attempt.length < 8) return null;
  if (!Number.isInteger(index) || index < 0 || index > 998) return null;
  const key = `gxobj${user}${attempt}${index + 1}`;
  return key.length >= 8 && key.length <= 80 ? key : null;
}

export function objectChargePlan(userId, attemptId, count) {
  const quote = quoteObjects(count);
  if (!quote.ok) return quote;
  const charges = [];
  for (let i = 0; i < quote.objects; i++) {
    const idempotencyKey = objectIdempotencyKey(userId, attemptId, i);
    if (!idempotencyKey) return { ok: false, error: "invalid_attempt", message: "Try the payment again." };
    charges.push({ productKey: PRODUCT_OBJECT, idempotencyKey, ixis: OBJECT_PRICE_IXIS, index: i });
  }
  return { ...quote, charges, totalIxis: quote.ixis };
}

export function seatsForEntitlement(row, now = Date.now()) {
  if (!row || (row.status && row.status !== "active")) return 0;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return 0;
  const key = String(row.product_key || "");
  if (key === PRODUCT_REPORT || key === PRODUCT_PACKAGE) return 0;
  const explicit = Number(row.object_limit);
  if (Number.isInteger(explicit) && explicit > 0 && (key === PRODUCT_OBJECT || key === PRODUCT_TRIAL || key.startsWith("geoxis.tracking."))) {
    return explicit;
  }
  if (LEGACY_OBJECT_LIMITS[key]) return LEGACY_OBJECT_LIMITS[key];
  if (key === PRODUCT_OBJECT || key === PRODUCT_TRIAL) return 1;
  return 0;
}

export function activeObjectLimit(rows, now = Date.now()) {
  return (rows || []).reduce((sum, row) => sum + seatsForEntitlement(row, now), 0);
}

/**
 * Updates to things already on the account are allowed while a plan is active.
 * A new thing is allowed only while the count stays within the paid (or trial) limit.
 * No active plan (limit 0) rejects every position.
 */
export function splitByObjectLimit({ limit, existingIds = [], incomingIds = [] }) {
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 0;
  const existing = new Set(existingIds.filter(Boolean));
  if (cap <= 0) {
    return {
      allowedIds: [],
      rejected: incomingIds.filter(Boolean).map((id) => ({ id, error: "object_limit" })),
      limit: 0,
      used: existing.size,
    };
  }
  const allowed = [];
  const rejected = [];
  const admitted = new Set();
  for (const id of incomingIds) {
    if (!id) continue;
    if (existing.has(id) || admitted.has(id)) {
      allowed.push(id);
      continue;
    }
    if (existing.size + admitted.size < cap) {
      admitted.add(id);
      allowed.push(id);
    } else {
      rejected.push({ id, error: "object_limit" });
    }
  }
  return { allowedIds: [...new Set(allowed)], rejected, limit: cap, used: existing.size + admitted.size };
}

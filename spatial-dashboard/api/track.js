// Public package tracker. The Ship24 key never leaves the server.
// 3 different packages are free per network address. Each package after that is $1 (100 Ixis),
// charged once through the Wallet. The same person + number always uses the same idempotency key.
import { createHash } from "node:crypto";
import { WalletError, isWalletConfigured, quote, redeem } from "../lib/apixis-wallet.js";
import { authContext, deleteWhere, patchWhere, selectMany, sendJson, upsert } from "../lib/supabaseServer.js";
import { clientIp, rateLimited } from "../lib/rateLimit.js";
import { detectCarrier, normalizeTrackingNumber, validTrackingNumber } from "../lib/carriers.js";
import { attachCoordinates } from "../lib/geocode.js";
import { ship24Key, trackWithShip24 } from "../lib/ship24.js";
import {
  isSampleNumber,
  lookupDecision,
  parseShip24Payload,
  samplePackage,
} from "../lib/tracking.js";
import { packageIdempotencyKey } from "../lib/packageKey.js";
import { PACKAGE_PRICE_IXIS, PACKAGE_PRICE_USD, PRODUCT_PACKAGE, WALLET_PRICES } from "../lib/pricing.js";

const memoryFree = new Map();
const memoryUnlock = new Map();

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    size += buf.length;
    if (size > 20_000) {
      const err = new Error("payload_too_large");
      err.status = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function billingOwner(ctx) {
  const apixisSub = ctx?.user?.app_metadata?.apixis_sub;
  return typeof apixisSub === "string" && apixisSub ? apixisSub : ctx?.user?.email || "";
}

function ipViewerKey(req) {
  const hash = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 32);
  return `ip:${hash}`;
}

async function freeNumbersFor(viewer) {
  try {
    const rows = await selectMany(
      "package_lookups",
      `viewer_key=eq.${encodeURIComponent(viewer)}&select=tracking_number&limit=50`,
    );
    return rows.map((row) => row.tracking_number);
  } catch {
    return [...(memoryFree.get(viewer) || [])];
  }
}

async function rememberFree(viewer, trackingNumber) {
  const number = normalizeTrackingNumber(trackingNumber);
  try {
    await upsert("package_lookups", { viewer_key: viewer, tracking_number: number }, "viewer_key,tracking_number");
  } catch {
    const set = memoryFree.get(viewer) || new Set();
    set.add(number);
    memoryFree.set(viewer, set);
  }
}

async function hasUnlock(owner, trackingNumber) {
  const number = normalizeTrackingNumber(trackingNumber);
  try {
    const rows = await selectMany(
      "package_unlocks",
      `owner=eq.${encodeURIComponent(owner)}&tracking_number=eq.${encodeURIComponent(number)}&select=id&limit=1`,
    );
    return rows.length > 0;
  } catch {
    return memoryUnlock.get(owner)?.has(number) || false;
  }
}

async function saveUnlock({ ctx, owner, trackingNumber, carrier, reservationId }) {
  const number = normalizeTrackingNumber(trackingNumber);
  try {
    await upsert("package_unlocks", {
      tenant_id: ctx.tenant.id,
      user_id: ctx.user.id,
      owner,
      tracking_number: number,
      carrier: carrier?.name || null,
      reservation_id: reservationId,
      status: "active",
    }, "owner,tracking_number");
  } catch (err) {
    console.error("[track] unlock save failed:", err?.message || err);
    const set = memoryUnlock.get(owner) || new Set();
    set.add(number);
    memoryUnlock.set(owner, set);
  }
}

async function markDelivered(owner, trackingNumber) {
  const number = normalizeTrackingNumber(trackingNumber);
  await patchWhere(
    "package_unlocks",
    `owner=eq.${encodeURIComponent(owner)}&tracking_number=eq.${encodeURIComponent(number)}&delivered_at=is.null`,
    { delivered_at: new Date().toISOString(), status: "delivered" },
  ).catch(() => {});
}

async function loadLive(number, carrier) {
  const key = ship24Key();
  let payload;
  try {
    payload = await trackWithShip24(number, carrier.ship24Code, { key });
  } catch (err) {
    if (carrier.ship24Code && (err.status === 404 || err.status === 400)) {
      payload = await trackWithShip24(number, null, { key });
    } else {
      throw err;
    }
  }
  const parsed = parseShip24Payload(payload, number);
  if (!parsed.stops.length) {
    const err = new Error("We could not find that package. Check the number and try again.");
    err.status = 404;
    throw err;
  }
  const stops = await attachCoordinates(parsed.stops);
  const detected = carrier.id === "unknown" && parsed.courierHint
    ? { ...carrier, name: parsed.courierHint, id: parsed.courierHint }
    : carrier;
  return {
    sample: false,
    label: null,
    trackingNumber: parsed.trackingNumber || number,
    carrier: detected,
    delivered: parsed.delivered,
    stops,
  };
}

function paymentRequiredBody(decision, carrier, signedIn) {
  return {
    error: "payment_required",
    message: decision.message,
    priceUsd: PACKAGE_PRICE_USD,
    priceIxis: PACKAGE_PRICE_IXIS,
    productKey: PRODUCT_PACKAGE,
    signIn: !signedIn,
    signInUrl: "/auth/apixis/start?next=/track",
    carrier,
    card: "You can pay by card or with Ixis (100 Ixis = $1). Card checkout is not available yet.",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (rateLimited(`track:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return sendJson(res, 429, { error: "rate_limited", message: "Too many lookups. Please wait a few minutes and try again." });
  }

  try {
    const body = await readBody(req);
    const number = normalizeTrackingNumber(body.trackingNumber);
    if (!validTrackingNumber(number)) {
      return sendJson(res, 400, {
        error: "invalid_tracking_number",
        message: "Enter a tracking number, 5 to 50 letters or numbers. You can also open the sample package.",
      });
    }
    if (isSampleNumber(number)) return sendJson(res, 200, samplePackage());

    const carrier = detectCarrier(number);
    if (!ship24Key()) {
      return sendJson(res, 503, {
        error: "tracking_not_configured",
        carrier,
        message: "Package tracking is not connected yet. Add SHIP24_API_KEY on the server, then try again. You can still open the sample package to see the map.",
      });
    }

    const ctx = await authContext(req).catch(() => null);
    const owner = billingOwner(ctx);
    const unlocked = owner ? await hasUnlock(owner, number) : false;
    const decision = lookupDecision({
      freeNumbers: await freeNumbersFor(ipViewerKey(req)),
      unlocked,
      trackingNumber: number,
    });

    if (!decision.allow && !body.pay) {
      return sendJson(res, 402, paymentRequiredBody(decision, carrier, Boolean(ctx && owner)));
    }

    if (!decision.allow && body.pay) {
      if (!ctx || !owner) {
        return sendJson(res, 401, {
          error: "sign_in_required",
          message: "Sign in with Apixis to pay $1 (100 Ixis) for this package.",
          signInUrl: "/auth/apixis/start?next=/track",
          ...paymentRequiredBody(decision, carrier, false),
        });
      }
      if (!isWalletConfigured()) {
        return sendJson(res, 503, { error: "wallet_not_configured", message: "Ixis payments are not connected yet. Nothing was charged." });
      }
      const quoted = await quote(PRODUCT_PACKAGE);
      const ixis = Number(quoted?.xp ?? quoted?.ixis);
      if (ixis !== WALLET_PRICES[PRODUCT_PACKAGE]) {
        return sendJson(res, 409, {
          error: "price_mismatch",
          message: `Apixis Wallet lists ${PRODUCT_PACKAGE} at ${ixis} Ixis. It must be ${PACKAGE_PRICE_IXIS} Ixis ($1). Nothing was charged.`,
        });
      }
      // Confirm the number exists before taking Ixis, and do not send the stops until the charge lands.
      const preview = await loadLive(number, carrier);
      let reservationId = null;
      const paid = await redeem({
        owner,
        productKey: PRODUCT_PACKAGE,
        idempotencyKey: packageIdempotencyKey(owner, number),
        provision: async (held) => {
          reservationId = String(held.reservationId);
          await saveUnlock({ ctx, owner, trackingNumber: number, carrier, reservationId });
          return { reservationId };
        },
        unprovision: async () => {
          if (reservationId) {
            await deleteWhere("package_unlocks", `reservation_id=eq.${encodeURIComponent(reservationId)}&receipt_id=is.null`).catch(() => {});
          }
        },
      });
      if (!paid.ok) {
        return sendJson(res, 402, {
          error: "insufficient_ixis",
          message: paid.message || "Not enough Ixis. This package is $1 (100 Ixis).",
          needed: paid.needed ?? PACKAGE_PRICE_IXIS,
          priceUsd: PACKAGE_PRICE_USD,
          priceIxis: PACKAGE_PRICE_IXIS,
          carrier,
        });
      }
      if (reservationId) {
        await patchWhere("package_unlocks", `reservation_id=eq.${encodeURIComponent(reservationId)}`, {
          receipt_id: paid.receiptId ?? null,
        }).catch(() => {});
      }
      if (preview.delivered) await markDelivered(owner, number);
      return sendJson(res, 200, { ...preview, paid: true, priceIxis: PACKAGE_PRICE_IXIS, priceUsd: PACKAGE_PRICE_USD });
    }

    const live = await loadLive(number, carrier);
    if (decision.recordFree) await rememberFree(ipViewerKey(req), number);
    if (live.delivered && owner && unlocked) await markDelivered(owner, number);
    return sendJson(res, 200, live);
  } catch (err) {
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: "invalid_json", message: "That request could not be read." });
    if (err instanceof WalletError && err.insufficient) {
      return sendJson(res, 402, { error: "insufficient_ixis", message: "Not enough Ixis. This package is $1 (100 Ixis)." });
    }
    if (err?.status === 404 && /catalog|Unknown redeem|Unknown product/i.test(String(err.message))) {
      return sendJson(res, 409, {
        error: "unknown_sku",
        message: `Apixis Wallet does not have ${PRODUCT_PACKAGE} yet (100 Ixis). Nothing was charged.`,
      });
    }
    const status = err.status === 404 ? 404 : err.status || 500;
    const message = status === 404
      ? "We could not find that package. Check the number and try again."
      : (err.message || "Package tracking failed.");
    if (status >= 500) console.error("[track] error:", err);
    return sendJson(res, status >= 400 && status < 600 ? status : 500, { error: "track_failed", message });
  }
}

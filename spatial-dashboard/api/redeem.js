// Change note (Grok, Oct 2026): per-object pricing. Small/Medium/Large are retired.
// One Wallet redeem of geoxis.tracking.object (500 Ixis) per object. The catalog price is checked
// before any hold, so a wrong SKU amount cannot be charged. PLANS_ON_SALE is on because Awad locked
// these prices. Card checkout is not here; Ixis is the path that charges.
import { WalletError, isWalletConfigured, quote, redeem } from "../lib/apixis-wallet.js";
import { authContext, deleteWhere, patchWhere, selectMany, sendJson, upsert } from "../lib/supabaseServer.js";

async function upsertEntitlement(row) {
  try {
    return await upsert("entitlements", row, "reservation_id");
  } catch (err) {
    if (row.object_limit != null && /object_limit/i.test(String(err?.message || err))) {
      const { object_limit, ...rest } = row;
      return upsert("entitlements", rest, "reservation_id");
    }
    throw err;
  }
}
import { entitlementExpiry } from "../lib/ingest.js";
import {
  PRODUCT_OBJECT,
  PRODUCT_REPORT,
  PRODUCT_TRIAL,
  RETIRED_PRODUCT_KEYS,
  TRIAL_OBJECTS,
  WALLET_PRICES,
  objectChargePlan,
} from "../lib/pricing.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// Awad locked the prices on 2026-10-06 and asked the Ixis charge to work.
const PLANS_ON_SALE = true;

function billingOwner(ctx) {
  const apixisSub = ctx?.user?.app_metadata?.apixis_sub;
  return typeof apixisSub === "string" && apixisSub ? apixisSub : ctx?.user?.email || "";
}

async function assertCatalogPrice(productKey) {
  const expected = WALLET_PRICES[productKey];
  const quoted = await quote(productKey);
  const ixis = Number(quoted?.xp ?? quoted?.ixis);
  if (ixis !== expected) {
    const err = new Error(`Apixis Wallet lists ${productKey} at ${ixis} Ixis. It must be ${expected} Ixis. Nothing was charged.`);
    err.status = 409;
    err.code = "price_mismatch";
    throw err;
  }
  return quoted;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

  const ctx = await authContext(req).catch(() => null);
  if (!ctx) return sendJson(res, 401, { error: "not_authenticated", message: "Sign in with Apixis to pay." });

  try {
    const body = await readBody(req);
    const productKey = body.productKey;
    if (!productKey || typeof productKey !== "string") return sendJson(res, 400, { error: "missing_product_key" });

    if (RETIRED_PRODUCT_KEYS.includes(productKey)) {
      return sendJson(res, 400, {
        error: "plan_retired",
        message: "Small, Medium, and Large fleet plans are closed. Pick how many things to follow. Each one is $5 a month (500 Ixis), with a 3-thing minimum.",
      });
    }

    if (productKey === PRODUCT_TRIAL) return startTrial(res, ctx);

    if (!PLANS_ON_SALE) {
      return sendJson(res, 409, { error: "not_on_sale", message: "Geoxis plans open soon. Nothing was charged." });
    }
    if (!isWalletConfigured()) {
      return sendJson(res, 503, { error: "wallet_not_configured", message: "Wallet API key is missing. Nothing was charged." });
    }

    const owner = billingOwner(ctx);
    if (!owner) return sendJson(res, 401, { error: "email_not_verified" });

    if (productKey === PRODUCT_OBJECT) return redeemObjects(res, ctx, owner, body);
    if (productKey === PRODUCT_REPORT) return redeemReport(res, ctx, owner, body);

    return sendJson(res, 400, { error: "unknown_product", message: "That product is not for sale." });
  } catch (err) {
    if (err instanceof SyntaxError) return sendJson(res, 400, { error: "invalid_json" });
    return failRedeem(res, err);
  }
}

async function startTrial(res, ctx) {
  const existing = await selectMany(
    "entitlements",
    `tenant_id=eq.${encodeURIComponent(ctx.tenant.id)}&product_key=eq.${PRODUCT_TRIAL}&select=id,status,expires_at`,
  ).catch(() => null);
  if (existing === null) {
    return sendJson(res, 503, { error: "entitlements_unavailable", message: "The trial could not be saved yet. Nothing was charged." });
  }
  const live = existing.find((row) => row.status === "active" && (!row.expires_at || Date.parse(row.expires_at) > Date.now()));
  if (existing.length) {
    return sendJson(res, live ? 200 : 409, {
      error: live ? undefined : "trial_used",
      success: Boolean(live),
      message: live
        ? "Your free trial is already running. It follows 1 thing."
        : "The free trial was already used on this account.",
      expiresAt: live?.expires_at || existing[0]?.expires_at || null,
      objects: TRIAL_OBJECTS,
    });
  }
  const expiresAt = entitlementExpiry(PRODUCT_TRIAL);
  await upsertEntitlement({
    tenant_id: ctx.tenant.id,
    user_id: ctx.user.id,
    owner: billingOwner(ctx) || ctx.user.email,
    product_key: PRODUCT_TRIAL,
    reservation_id: `trial-${ctx.user.id}`,
    status: "active",
    object_limit: TRIAL_OBJECTS,
    expires_at: expiresAt,
  }, "reservation_id");
  return sendJson(res, 200, {
    success: true,
    productKey: PRODUCT_TRIAL,
    objects: TRIAL_OBJECTS,
    expiresAt,
    message: "Free trial started. You can follow 1 thing for 14 days. Nothing was charged.",
  });
}

async function redeemObjects(res, ctx, owner, body) {
  const { attemptId } = body;
  if (!attemptId || typeof attemptId !== "string" || attemptId.length > 80) {
    return sendJson(res, 400, { error: "invalid_attempt_id", message: "attemptId required, max 80 chars" });
  }
  const plan = objectChargePlan(ctx.user.id, attemptId, body.objectCount);
  if (!plan.ok) return sendJson(res, 400, plan);

  await assertCatalogPrice(PRODUCT_OBJECT);

  const captured = [];
  for (const charge of plan.charges) {
    const result = await redeemOne({
      ctx,
      owner,
      productKey: charge.productKey,
      idempotencyKey: charge.idempotencyKey,
      objectLimit: 1,
    });
    if (!result.ok) {
      return sendJson(res, 402, {
        error: "insufficient_ixis",
        message: captured.length
          ? `We added ${captured.length} of ${plan.objects} things. Buy more Ixis for the rest. You were not charged again for the ones already added.`
          : (result.message || "Not enough Ixis."),
        needed: result.needed,
        chargedObjects: captured.length,
        ixisCharged: captured.length * WALLET_PRICES[PRODUCT_OBJECT],
      });
    }
    captured.push(result);
  }
  // A new month replaces the previous object seats. Buying 3 again stays at 3, it does not become 6.
  const ids = captured.map((row) => row.reservationId).filter(Boolean);
  if (ids.length === plan.objects) {
    const list = ids.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
    await patchWhere(
      "entitlements",
      `tenant_id=eq.${encodeURIComponent(ctx.tenant.id)}&product_key=eq.${PRODUCT_OBJECT}&status=eq.active&reservation_id=not.in.(${list})`,
      { status: "expired" },
    ).catch((err) => console.error("[redeem] expire previous seats failed:", err?.message || err));
  }
  return sendJson(res, 200, {
    success: true,
    productKey: PRODUCT_OBJECT,
    objects: captured.length,
    ixis: captured.length * WALLET_PRICES[PRODUCT_OBJECT],
    usd: plan.usd,
    expiresAt: entitlementExpiry(PRODUCT_OBJECT),
    message: `You can now follow ${captured.length} things. This renews monthly.`,
  });
}

async function redeemReport(res, ctx, owner, body) {
  const { attemptId } = body;
  if (!attemptId || typeof attemptId !== "string" || attemptId.length > 80) {
    return sendJson(res, 400, { error: "invalid_attempt_id", message: "attemptId required, max 80 chars" });
  }
  await assertCatalogPrice(PRODUCT_REPORT);
  const idempotencyKey = `gxrep${String(ctx.user.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}${attemptId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
  const result = await redeemOne({ ctx, owner, productKey: PRODUCT_REPORT, idempotencyKey, objectLimit: null });
  if (!result.ok) {
    return sendJson(res, 402, { error: "insufficient_ixis", message: result.message || "Not enough Ixis.", needed: result.needed });
  }
  return sendJson(res, 200, {
    success: true,
    productKey: PRODUCT_REPORT,
    ixis: WALLET_PRICES[PRODUCT_REPORT],
    usd: 10,
    expiresAt: null,
    message: "Map report unlocked.",
  });
}

async function redeemOne({ ctx, owner, productKey, idempotencyKey, objectLimit }) {
  let reservationId = null;
  const result = await redeem({
    owner,
    productKey,
    idempotencyKey,
    provision: async (held) => {
      reservationId = String(held.reservationId);
      const row = {
        tenant_id: ctx.tenant.id,
        user_id: ctx.user.id,
        owner,
        product_key: productKey,
        reservation_id: reservationId,
        status: "active",
        expires_at: entitlementExpiry(productKey),
      };
      if (objectLimit) row.object_limit = objectLimit;
      const saved = await upsertEntitlement(row);
      return { entitlementRowId: saved.id };
    },
    unprovision: async () => {
      if (reservationId) await deleteWhere("entitlements", `reservation_id=eq.${encodeURIComponent(reservationId)}&receipt_id=is.null`);
    },
  });
  if (!result.ok) return result;
  if (reservationId) {
    await patchWhere("entitlements", `reservation_id=eq.${encodeURIComponent(reservationId)}`, {
      receipt_id: result.receiptId ?? null,
      wallet_entitlement_id: result.entitlementId ?? null,
    }).catch((e) => console.error("[redeem] receipt save failed:", e));
  }
  return { ...result, reservationId };
}

function failRedeem(res, err) {
  if (err instanceof WalletError && err.insufficient) {
    return sendJson(res, 402, { error: "insufficient_ixis", message: "Not enough Ixis. Buy Ixis in Apixis Wallet." });
  }
  if (err?.status === 404 || err?.code === "price_mismatch") {
    return sendJson(res, 409, {
      error: err.code || "unknown_sku",
      message: err.message || "That price is not in the Apixis Wallet catalog yet. Nothing was charged.",
    });
  }
  if (err?.status === 402) {
    return sendJson(res, 402, { error: "insufficient_ixis", message: "Not enough Ixis. Buy Ixis in Apixis Wallet." });
  }
  console.error("[redeem] error:", err);
  return sendJson(res, err.status || 500, { error: "redeem_failed", message: err.message || "Redemption failed." });
}

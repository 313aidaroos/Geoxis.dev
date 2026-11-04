// Stable Wallet key for one person + one package. A refresh reuses it, so it cannot charge twice.
import { createHash } from "node:crypto";
import { normalizeTrackingNumber } from "./carriers.js";

export function packageIdempotencyKey(owner, trackingNumber) {
  const hash = createHash("sha256")
    .update(`${String(owner || "").trim().toLowerCase()}|${normalizeTrackingNumber(trackingNumber)}`)
    .digest("hex")
    .slice(0, 40);
  return `gxpkg${hash}`;
}

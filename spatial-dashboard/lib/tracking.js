// Package-tracker rules with no network and no Node built-ins, so the pricing and tracker pages can import them.
import {
  FREE_PACKAGE_LOOKUPS,
  PACKAGE_PRICE_IXIS,
  PACKAGE_PRICE_USD,
  PRODUCT_PACKAGE,
} from "./pricing.js";
import { normalizeTrackingNumber } from "./carriers.js";

export const SAMPLE_NUMBER = "SAMPLE";

export function isSampleNumber(input) {
  return normalizeTrackingNumber(input) === SAMPLE_NUMBER;
}

export function lookupDecision({ freeNumbers = [], unlocked = false, trackingNumber }) {
  const number = normalizeTrackingNumber(trackingNumber);
  if (isSampleNumber(number)) {
    return { allow: true, reason: "sample", priceUsd: 0, priceIxis: 0, recordFree: false };
  }
  if (unlocked) {
    return { allow: true, reason: "unlocked", priceUsd: PACKAGE_PRICE_USD, priceIxis: PACKAGE_PRICE_IXIS, recordFree: false };
  }
  const seen = freeNumbers.map((n) => normalizeTrackingNumber(n)).filter(Boolean);
  if (seen.includes(number)) {
    return { allow: true, reason: "free_repeat", priceUsd: 0, priceIxis: 0, recordFree: false };
  }
  if (seen.length < FREE_PACKAGE_LOOKUPS) {
    return {
      allow: true,
      reason: "free",
      priceUsd: 0,
      priceIxis: 0,
      recordFree: true,
      remainingAfter: FREE_PACKAGE_LOOKUPS - seen.length - 1,
    };
  }
  return {
    allow: false,
    reason: "payment_required",
    priceUsd: PACKAGE_PRICE_USD,
    priceIxis: PACKAGE_PRICE_IXIS,
    productKey: PRODUCT_PACKAGE,
    recordFree: false,
    message: "The first 3 packages are free. This one is $1 (100 Ixis). Sign in with Apixis to pay. Paying once lets you follow this package until it is delivered. Refreshing the page does not charge you again.",
  };
}

export function plainStatus(milestone, fallback) {
  const m = String(milestone || "").toLowerCase().replace(/\s+/g, "_");
  if (m.includes("delivered")) return "Delivered";
  if (m.includes("out_for_delivery")) return "Out for delivery";
  if (m.includes("in_transit") || m === "transit") return "On the way";
  if (m.includes("info_received") || m.includes("pending") || m.includes("label")) return "Label created";
  if (m.includes("pickup") || m.includes("picked")) return "Picked up";
  if (m.includes("exception") || m.includes("fail") || m.includes("return")) return "Needs attention";
  const text = String(fallback || "").trim();
  return text || "Update";
}

export function placeFromEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (typeof event.location === "string" && event.location.trim()) return event.location.trim();
  const loc = event.location && typeof event.location === "object" ? event.location : {};
  const parts = [loc.city || event.city, loc.state || event.state, loc.countryCode || loc.country || event.countryCode || event.country]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function parseShip24Payload(payload, fallbackNumber = "") {
  const tracking = payload?.data?.trackings?.[0] || payload?.data?.tracking || null;
  const events = Array.isArray(tracking?.events) ? tracking.events : Array.isArray(payload?.events) ? payload.events : [];
  const shipment = tracking?.shipment || {};
  const tracker = tracking?.tracker || {};
  const stops = events.map((event, index) => ({
    time: event?.occurrenceDatetime || event?.datetime || null,
    place: placeFromEvent(event),
    status: plainStatus(event?.statusMilestone || event?.statusCode, event?.status),
    order: Number.isFinite(event?.order) ? event.order : index,
  }));
  stops.sort((a, b) => {
    const ta = Date.parse(a.time || "");
    const tb = Date.parse(b.time || "");
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.order - b.order;
  });
  const milestone = String(shipment.statusMilestone || shipment.statusCode || "");
  const delivered = stops.some((s) => s.status === "Delivered") || /delivered/i.test(milestone);
  const number = tracker.trackingNumber || shipment.trackingNumbers?.[0] || fallbackNumber || null;
  const hinted = Array.isArray(tracker.courierCode) ? tracker.courierCode[0] : tracker.courierCode;
  return {
    sample: false,
    trackingNumber: number ? normalizeTrackingNumber(number) : normalizeTrackingNumber(fallbackNumber),
    delivered,
    stops,
    courierHint: hinted || null,
  };
}

export function samplePackage() {
  return {
    sample: true,
    label: "Sample package. This is an example, not a real shipment.",
    trackingNumber: SAMPLE_NUMBER,
    carrier: { id: "usps", name: "USPS", confidence: "sample", ship24Code: null },
    delivered: false,
    stops: [
      { time: "2026-10-01T09:00:00", place: "Shenzhen, CN", status: "Label created", latitude: 22.5431, longitude: 114.0579 },
      { time: "2026-10-03T18:20:00", place: "Los Angeles, CA, US", status: "Picked up", latitude: 33.9416, longitude: -118.4085 },
      { time: "2026-10-04T11:05:00", place: "Memphis, TN, US", status: "On the way", latitude: 35.0421, longitude: -89.9792 },
      { time: "2026-10-05T16:40:00", place: "Chicago, IL, US", status: "Out for delivery", latitude: 41.8781, longitude: -87.6298 },
    ],
  };
}

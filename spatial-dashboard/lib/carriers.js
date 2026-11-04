// Guess the carrier from a tracking number. Ship24 still auto-detects; this label is what we show
// and, when we are sure, the courier hint we send. Most specific patterns win.

const NAMES = Object.freeze({
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  dhl: "DHL",
  amazon: "Amazon",
  ontrac: "OnTrac",
  lasership: "LaserShip",
  "canada-post": "Canada Post",
  "royal-mail": "Royal Mail",
  "china-post": "China Post",
  postnl: "PostNL",
  "la-poste": "La Poste",
  "australia-post": "Australia Post",
  "japan-post": "Japan Post",
  "international-post": "International post",
  unknown: "Carrier not recognized",
});

const S10_SUFFIX = Object.freeze({
  US: "usps",
  DE: "dhl",
  NL: "postnl",
  GB: "royal-mail",
  UK: "royal-mail",
  CN: "china-post",
  CA: "canada-post",
  FR: "la-poste",
  AU: "australia-post",
  JP: "japan-post",
});

/** Ship24 courier codes we trust enough to send as a hint. */
const SHIP24 = Object.freeze({
  ups: "ups",
  fedex: "fedex",
  usps: "us-post",
  dhl: "dhl",
});

export function normalizeTrackingNumber(input) {
  return String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function validTrackingNumber(input) {
  const n = normalizeTrackingNumber(input);
  if (n === "SAMPLE") return true;
  if (!/^[A-Z0-9._/-]{5,50}$/.test(n)) return false;
  if (/^(0{5,}|1{5,}|123456789|TEST)/.test(n)) return false;
  return true;
}

function hit(id, confidence) {
  return {
    id,
    name: NAMES[id] || NAMES.unknown,
    confidence,
    ship24Code: SHIP24[id] || null,
  };
}

export function detectCarrier(input) {
  const raw = normalizeTrackingNumber(input);
  if (!raw) return hit("unknown", "none");

  if (/^1Z[0-9A-Z]{16}$/.test(raw)) return hit("ups", "high");
  if (/^TBA\d{8,}$/.test(raw)) return hit("amazon", "high");
  if (/^JD\d{10,20}$/.test(raw)) return hit("dhl", "high");
  if (/^1LS[0-9A-Z]{8,}$/.test(raw)) return hit("lasership", "medium");
  if (/^C\d{14}$/.test(raw)) return hit("ontrac", "medium");

  const s10 = raw.match(/^[A-Z]{2}\d{9}([A-Z]{2})$/);
  if (s10) return hit(S10_SUFFIX[s10[1]] || "international-post", "high");

  if (/^(94|93|92|91|70|23|03)\d{18,22}$/.test(raw)) return hit("usps", "high");
  if (/^420\d{20,34}$/.test(raw)) return hit("usps", "high");
  if (/^96\d{18,22}$/.test(raw)) return hit("fedex", "high");
  if (/^\d{12}$/.test(raw) || /^\d{15}$/.test(raw)) return hit("fedex", "medium");
  if (/^\d{20}$/.test(raw) || /^\d{22}$/.test(raw)) return hit("fedex", "low");
  if (/^\d{10}$/.test(raw)) return hit("dhl", "medium");

  return hit("unknown", "none");
}

import { authHeader, loadMe } from "./authClient.js";
import { detectCarrier, normalizeTrackingNumber } from "../lib/carriers.js";
import { PACKAGE_PRICE_IXIS, PACKAGE_PRICE_USD } from "../lib/pricing.js";
import { samplePackage } from "../lib/tracking.js";
import { mountPageHelp } from "./pageHelp.js";
import { showPackageRoute } from "./trackMap.js";

const form = document.getElementById("trackForm");
const input = document.getElementById("trackingNumber");
const guess = document.getElementById("carrierGuess");
const status = document.getElementById("trackStatus");
const result = document.getElementById("trackResult");
const banner = document.getElementById("sampleBanner");
const title = document.getElementById("resultTitle");
const timeline = document.getElementById("timeline");
const payPanel = document.getElementById("payPanel");
const payCopy = document.getElementById("payCopy");
const payBtn = document.getElementById("payPackage");
const payCardBtn = document.getElementById("payPackageCard");
const sampleBtn = document.getElementById("sampleBtn");
const map = document.getElementById("packageMap");

const BUY = `https://apixis-wallet.vercel.app/buy?product=geoxis&return_url=${encodeURIComponent(location.href)}`;

function setStatus(text, kind) {
  status.textContent = text || "";
  status.className = "mt-3 text-sm " + (kind === "bad" ? "text-red-300" : kind === "good" ? "text-emerald-300" : "text-slate-400");
}

function paintGuess() {
  const number = normalizeTrackingNumber(input.value);
  if (number.length < 5) {
    guess.textContent = "We will guess the carrier from the number.";
    return;
  }
  const carrier = detectCarrier(number);
  guess.textContent = carrier.id === "unknown"
    ? "We do not recognize this carrier yet. We will still ask the tracking service."
    : `This looks like ${carrier.name}.`;
}

function renderResult(data) {
  payPanel.classList.add("hidden");
  result.classList.remove("hidden");
  const sample = Boolean(data.sample);
  banner.classList.toggle("hidden", !sample);
  banner.textContent = data.label || "Sample package. This is an example, not a real shipment.";
  const carrierName = data.carrier?.name || "Package";
  const now = data.stops?.[data.stops.length - 1];
  title.textContent = data.delivered
    ? `${carrierName} · Delivered`
    : `${carrierName} · ${now?.place || "On the way"}`;
  timeline.replaceChildren();
  (data.stops || []).forEach((stop, index) => {
    const item = document.createElement("li");
    const current = index === data.stops.length - 1;
    item.className = "relative pl-4 border-l border-line pb-4";
    const when = document.createElement("div");
    when.className = "text-[12px] text-slate-500";
    when.textContent = stop.time ? stop.time.replace("T", " ").replace(/Z$/, " UTC") : "Time not listed";
    const where = document.createElement("div");
    where.className = "text-[14px] text-slate-100";
    where.textContent = stop.place || "Place not listed";
    const what = document.createElement("div");
    what.className = current ? "text-[13px] text-emerald-300" : "text-[13px] text-slate-400";
    what.textContent = current && !data.delivered ? `${stop.status} · where it is now` : stop.status;
    item.append(when, where, what);
    timeline.append(item);
  });
  showPackageRoute(map, data.stops || []).catch(() => {
    setStatus("The map could not draw this route. The list of stops is still above.", "bad");
  });
}

function showPay(data) {
  result.classList.add("hidden");
  payPanel.classList.remove("hidden");
  payCopy.textContent = data.message || `This package is $${PACKAGE_PRICE_USD} (${PACKAGE_PRICE_IXIS} Ixis). The first 3 packages are free.`;
  const number = normalizeTrackingNumber(input.value);
  payBtn.dataset.number = number;
  if (payCardBtn) payCardBtn.dataset.number = number;
}

async function lookup({ pay = false, sample = false } = {}) {
  const trackingNumber = sample ? "SAMPLE" : normalizeTrackingNumber(input.value);
  if (!sample && trackingNumber.length < 5) {
    setStatus("Enter a tracking number first.", "bad");
    return;
  }
  setStatus(pay ? "Taking 100 Ixis…" : "Looking up the package…", "");
  payBtn.disabled = true;
  try {
    if (sample) {
      renderResult(samplePackage());
      setStatus("Showing the sample package.", "good");
      return;
    }
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ trackingNumber, pay }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 402 && data.error === "payment_required") {
      showPay(data);
      setStatus(`This one is $${data.priceUsd || PACKAGE_PRICE_USD} (${data.priceIxis || PACKAGE_PRICE_IXIS} Ixis).`, "");
      return;
    }
    if (res.status === 401 && data.signInUrl) {
      showPay(data);
      setStatus(data.message || "Sign in with Apixis to pay.", "bad");
      return;
    }
    if (res.status === 402) {
      setStatus(data.message || "Not enough Ixis.", "bad");
      const link = document.createElement("a");
      link.href = BUY;
      link.className = "ml-2 text-emerald-300 underline";
      link.textContent = "Buy Ixis";
      status.append(link);
      return;
    }
    if (!res.ok) {
      setStatus(data.message || "We could not look that up.", "bad");
      return;
    }
    renderResult(data);
    setStatus(data.paid ? "Paid. You can follow this package until it is delivered." : "", "good");
  } catch (err) {
    setStatus("Network problem: " + err.message, "bad");
  } finally {
    payBtn.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  lookup();
});
input.addEventListener("input", paintGuess);
sampleBtn.addEventListener("click", () => lookup({ sample: true }));
payBtn.addEventListener("click", async () => {
  const me = await loadMe().catch(() => null);
  if (!me) {
    location.href = "/auth/apixis/start?next=/track";
    return;
  }
  lookup({ pay: true });
});

// 2026-10-14 (Geoxis Lead / Grok): one-time package card checkout. Stays disabled until /api/checkout reports the package SKU.
(async () => {
  if (!payCardBtn) return;
  const sku = payCardBtn.dataset.cardSku;
  const cardStatus = await fetch("/api/checkout").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!cardStatus?.enabled || !cardStatus.skus?.[sku]) return;
  payCardBtn.disabled = false;
  payCardBtn.removeAttribute("title");
  payCardBtn.classList.remove("text-slate-500", "cursor-not-allowed");
  payCardBtn.classList.add("text-slate-200", "hover:bg-surface-2");
  payCardBtn.addEventListener("click", async () => {
    const trackingNumber = payCardBtn.dataset.number || normalizeTrackingNumber(input.value);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ sku, quantity: 1, trackingNumber }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) window.location.href = data.url;
    else setStatus(data.message || "Card checkout could not start. Nothing was charged.", "bad");
  });
})();

paintGuess();
if (new URLSearchParams(location.search).get("sample") === "1") lookup({ sample: true });

mountPageHelp({
  title: "How to track a package",
  steps: [
    "Type the tracking number from the shipping label.",
    "Press Track. We guess the carrier from the number.",
    "The map shows where the package is now, and the list shows every stop.",
    "Your first 3 different packages are free.",
    "The next package is $1, which is 100 Ixis. The price is shown before you pay.",
    "Sign in with Apixis to pay with Ixis, or press Pay by card · $1 when card checkout is set up.",
    "After you pay, you can keep opening that package until it is delivered. A refresh does not charge you again.",
  ],
});

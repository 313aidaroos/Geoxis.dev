import { loadMe, authHeader } from "./authClient.js";
import { mountPageHelp } from "./pageHelp.js";
import {
  CONTACT_SALES_AT,
  MIN_OBJECTS,
  OBJECT_PRICE_IXIS,
  OBJECT_PRICE_USD,
  PRODUCT_OBJECT,
  PRODUCT_REPORT,
  PRODUCT_TRIAL,
  REPORT_PRICE_IXIS,
  SALES_EMAIL,
  quoteObjects,
} from "../lib/pricing.js";

const countInput = document.getElementById("objectCount");
const priceUsd = document.getElementById("priceUsd");
const priceIxis = document.getElementById("priceIxis");
const priceNote = document.getElementById("priceNote");
const payBtn = document.getElementById("payObjects");
const trialBtn = document.getElementById("startTrial");
const reportBtn = document.getElementById("payReport");
const salesForm = document.getElementById("salesForm");
const status = document.getElementById("status");
const payBlock = document.getElementById("payBlock");
const salesBlock = document.getElementById("salesBlock");

const BUY = `https://apixis-wallet.vercel.app/buy?product=geoxis&return_url=${encodeURIComponent(location.href)}`;

function setStatus(text, kind) {
  status.textContent = text;
  status.className = "mt-4 text-sm " + (kind === "bad" ? "text-red-300" : kind === "good" ? "text-emerald-300" : "text-slate-400");
}

function paintQuote() {
  const quote = quoteObjects(countInput.value);
  if (!quote.ok && quote.error === "contact_sales") {
    payBlock.classList.add("hidden");
    salesBlock.classList.remove("hidden");
    priceUsd.textContent = `${CONTACT_SALES_AT}+ things`;
    priceIxis.textContent = "Talk to sales";
    priceNote.textContent = "Plans of 200 or more are set up by email.";
    return;
  }
  payBlock.classList.remove("hidden");
  salesBlock.classList.add("hidden");
  if (!quote.ok) {
    priceUsd.textContent = `$${MIN_OBJECTS * OBJECT_PRICE_USD}/month`;
    priceIxis.textContent = `${(MIN_OBJECTS * OBJECT_PRICE_IXIS).toLocaleString()} Ixis`;
    priceNote.textContent = quote.message;
    payBtn.disabled = true;
    return;
  }
  priceUsd.textContent = `$${quote.usd}/month`;
  priceIxis.textContent = `${quote.ixis.toLocaleString()} Ixis`;
  priceNote.textContent = `${quote.objects} things × $${OBJECT_PRICE_USD} ( ${OBJECT_PRICE_IXIS} Ixis each ). This covers 30 days.`;
  payBtn.disabled = false;
  payBtn.textContent = `Pay with Ixis · ${quote.ixis.toLocaleString()}`;
}

async function requireSignIn() {
  const me = await loadMe().catch(() => null);
  if (me) return me;
  location.href = `/auth/apixis/start?next=${encodeURIComponent("/pricing")}`;
  return null;
}

async function postRedeem(body, button, idleLabel) {
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "Working…";
  setStatus("", "");
  try {
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) {
      setStatus(data.message || "Not enough Ixis.", "bad");
      status.append(document.createTextNode(" "));
      const link = document.createElement("a");
      link.href = BUY;
      link.className = "text-emerald-300 underline";
      link.textContent = "Buy Ixis";
      status.append(link);
      return;
    }
    if (!res.ok) {
      setStatus(data.message || "That payment did not go through. Nothing else was charged.", "bad");
      return;
    }
    button.dataset.attempt = "";
    setStatus(data.message || "Done.", "good");
  } catch (err) {
    setStatus("Network problem: " + err.message, "bad");
  } finally {
    button.disabled = false;
    button.textContent = button === payBtn ? idleLabel : previous;
    paintQuote();
  }
}

payBtn.addEventListener("click", async () => {
  const quote = quoteObjects(countInput.value);
  if (!quote.ok) {
    setStatus(quote.message, "bad");
    return;
  }
  if (!(await requireSignIn())) return;
  if (!payBtn.dataset.attempt) payBtn.dataset.attempt = crypto.randomUUID();
  await postRedeem(
    { productKey: PRODUCT_OBJECT, objectCount: quote.objects, attemptId: payBtn.dataset.attempt },
    payBtn,
    `Pay with Ixis · ${quote.ixis.toLocaleString()}`,
  );
});

trialBtn.addEventListener("click", async () => {
  if (!(await requireSignIn())) return;
  trialBtn.disabled = true;
  trialBtn.textContent = "Working…";
  try {
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ productKey: PRODUCT_TRIAL }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(data.message || (res.ok ? "Trial started." : "The trial could not start."), res.ok ? "good" : "bad");
  } catch (err) {
    setStatus("Network problem: " + err.message, "bad");
  } finally {
    trialBtn.disabled = false;
    trialBtn.textContent = "Start 14-day free trial";
  }
});

reportBtn.addEventListener("click", async () => {
  if (!(await requireSignIn())) return;
  if (!reportBtn.dataset.attempt) reportBtn.dataset.attempt = crypto.randomUUID();
  await postRedeem({ productKey: PRODUCT_REPORT, attemptId: reportBtn.dataset.attempt }, reportBtn, "Pay with Ixis · 1,000");
});

countInput.addEventListener("input", () => {
  payBtn.dataset.attempt = "";
  paintQuote();
});

salesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("salesName").value.trim();
  const email = document.getElementById("salesEmail").value.trim();
  const count = document.getElementById("salesCount").value.trim();
  const note = document.getElementById("salesNote").value.trim();
  const subject = encodeURIComponent("Geoxis — 200 or more things to follow");
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nThings to follow: ${count}\n\n${note}`);
  location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
  setStatus(`Your email app should open a message to ${SALES_EMAIL}.`, "good");
});

paintQuote();
loadMe().catch(() => null);

mountPageHelp({
  title: "How to set up tracking",
  steps: [
    "Type how many things you want on the map. A thing can be a plane, a ship, a truck, freight, mail, or equipment.",
    "Read the price. It is $5 a month for each thing, and the smallest plan is 3 things ($15).",
    "Sign in with Apixis if you are not signed in yet.",
    "Press Pay with Ixis. We take 500 Ixis for each thing. Card payment is not set up yet.",
    "Or press the free trial button to follow 1 thing for 14 days.",
    "For a one-time map report, press the $10 report button (1,000 Ixis).",
    "For 200 or more things, use the sales form. It emails awad@apixis.dev.",
  ],
});

// 2026-10-14 (Geoxis Lead / Grok): card checkout. Buttons stay disabled until /api/checkout reports Stripe is set up.
(async () => {
  const buttons = [...document.querySelectorAll("[data-card-sku]")];
  if (!buttons.length) return;
  const status = await fetch("/api/checkout").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!status?.enabled) return;
  for (const btn of buttons) {
    const sku = btn.dataset.cardSku;
    if (!status.skus?.[sku]) continue;
    btn.disabled = false;
    btn.classList.remove("text-slate-500", "cursor-not-allowed");
    btn.classList.add("text-slate-200", "hover:bg-surface-2");
    btn.addEventListener("click", async () => {
      const qty = Number(document.getElementById("objectCount")?.value || 1);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ sku, quantity: qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.location.href = data.url;
      else alert(data.message || "Card checkout could not start. Nothing was charged.");
    });
  }
})();

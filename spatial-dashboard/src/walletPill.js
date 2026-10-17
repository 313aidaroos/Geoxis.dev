// Apixis Wallet balance pill (2026-09-27, Grok Bot). Header of every Geoxis screen.
// Reads GET /api/wallet/balance (the Wallet key stays on the server). Refetches on focus / visibility /
// pageshow, so the number updates on return from Apixis Wallet. Signed out or not linked → "Sign in with Apixis".
import { getToken } from "./authClient.js";

const BUY = "https://apixis-wallet.vercel.app/buy?product=geoxis&return_url=" + encodeURIComponent("https://spatial-dashboard-xi.vercel.app/");

function build() {
  const wrap = document.createElement("span");
  wrap.className = "wallet-pill";
  const pill = document.createElement("a");
  pill.href = BUY;
  pill.title = "Your Apixis Wallet balance · Buy Ixis";
  pill.className = "pill hidden";
  pill.textContent = "✦ — Ixis";
  const link = document.createElement("a");
  link.className = "signin";
  link.textContent = "Sign in with Apixis";
  wrap.append(pill, link);
  return { wrap, pill, link };
}

function mount(wrap) {
  const slot = document.querySelector("[data-wallet-pill]");
  if (slot) {
    slot.replaceChildren(wrap);
    return true;
  }
  const sidebar = document.querySelector("#sidebar > div");
  if (sidebar) {
    const row = document.createElement("div");
    row.className = "px-5 py-1.5 flex items-center justify-end border-b border-line";
    row.append(wrap);
    sidebar.after(row);
    return true;
  }
  const back = document.querySelector('main > a[href="/"]');
  if (back) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3";
    back.replaceWith(row);
    row.append(back, wrap);
    return true;
  }
  return false;
}

const ui = build();
let busy = false;
function show(el, on) { el.classList.toggle("hidden", !on); }

async function load() {
  ui.link.href = "/auth/apixis/start?next=" + encodeURIComponent(location.pathname + location.search);
  const token = getToken();
  if (!token) { show(ui.pill, false); show(ui.link, true); return; }
  if (busy) return;
  busy = true;
  try {
    const res = await fetch("/api/wallet/balance", { cache: "no-store", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    const d = (await res.json().catch(() => ({}))) || {};
    const amount = typeof d.available === "number" && Number.isFinite(d.available) ? d.available : null;
    ui.pill.textContent = `✦ ${amount === null ? "—" : amount.toLocaleString()} Ixis`;
    if (d.buy) ui.pill.href = d.buy;
    show(ui.pill, res.status !== 401);
    show(ui.link, res.status === 401 || d.linked === false);
  } catch {
    /* Wallet unreachable: keep "—" */
  } finally {
    busy = false;
  }
}

function start() {
  if (!mount(ui.wrap)) return;
  load();
  window.addEventListener("focus", load);
  window.addEventListener("pageshow", load);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();

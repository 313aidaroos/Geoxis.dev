// Shared page shell (2026-10-17 redesign): top bar (logo, nav, search, wallet pill, account) and the
// family footer. Pages drop <header data-shell data-active="pricing"></header> and
// <footer data-shell-footer></footer> and import this module. Nothing here touches billing.
import { getToken, loadMe, clearSession } from "./authClient.js";
import { renderIxisCompanies } from "./ixisCompanies.js";

export const NAV = [
  { key: "overview", label: "Overview", href: "/" },
  { key: "globe", label: "Live Globe", href: "/?view=globe" },
  { key: "fleet", label: "Fleet", href: "/fleet" },
  { key: "track", label: "Track", href: "/track" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "companies", label: "Companies", href: "/companies" },
  { key: "feed", label: "Feed", href: "/feed" },
  { key: "cixy", label: "Cixy", href: "/?cixy=1" },
];

const ICON = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/></svg>',
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
};

function initials(email) {
  const local = String(email || "").split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const s = (parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "");
  return s.toUpperCase() || "G";
}

export function mountShell({ active = "", search = true } = {}) {
  const header = document.querySelector("header[data-shell]");
  if (header) {
    const act = header.dataset.active || active;
    const here = location.pathname + location.search;
    header.className = "gx-header";
    header.innerHTML = `
      <div class="gx-header-inner">
        <button class="gx-icon-btn gx-menu-btn" aria-label="Menu" aria-expanded="false" data-menu>${ICON.menu}</button>
        <a class="gx-brand" href="/" aria-label="Geoxis home"><img src="/brand/logo-full.png" alt="Geoxis" width="96" height="28" /></a>
        <nav class="gx-nav" aria-label="Main" data-nav>
          ${NAV.map((n) => `<a class="nav-link" href="${n.href}" ${n.key === act ? 'aria-current="page"' : ""}>${n.label}</a>`).join("")}
        </nav>
        <div class="gx-header-right">
          ${search ? `<form class="gx-search" role="search" data-search autocomplete="off">
            <span class="ico">${ICON.search}</span>
            <input type="search" name="q" placeholder="Search flights, vessels, trucks, or places…" aria-label="Search" />
            <kbd>/</kbd>
            <div class="gx-search-results hidden" data-search-results role="listbox"></div>
          </form>` : ""}
          <span data-wallet-pill></span>
          <button class="gx-icon-btn" aria-label="Notifications" data-bell title="Alerts">${ICON.bell}<span class="dot hidden" data-bell-dot></span></button>
          <div style="position:relative">
            <button class="gx-account" data-account aria-haspopup="menu" aria-expanded="false">
              <span class="gx-avatar" data-avatar>·</span><span data-account-label>Sign in</span>${ICON.chevron}
            </button>
            <div class="gx-account-menu hidden" data-account-menu role="menu"></div>
          </div>
        </div>
      </div>`;

    const menuBtn = header.querySelector("[data-menu]");
    const nav = header.querySelector("[data-nav]");
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });

    const searchForm = header.querySelector("[data-search]");
    if (searchForm) {
      const input = searchForm.querySelector("input");
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        if (location.pathname === "/" || location.pathname === "/index.html") {
          window.dispatchEvent(new CustomEvent("gx:search", { detail: { q, submit: true } }));
        } else {
          location.href = `/?q=${encodeURIComponent(q)}`;
        }
      });
      input.addEventListener("input", () => window.dispatchEvent(new CustomEvent("gx:search", { detail: { q: input.value.trim(), submit: false } })));
      input.addEventListener("focus", () => searchForm.classList.add("open"));
      input.addEventListener("blur", () => setTimeout(() => searchForm.classList.remove("open"), 150));
      searchForm.querySelector(".ico").addEventListener("click", () => { searchForm.classList.add("open"); input.focus(); });
      document.addEventListener("keydown", (e) => {
        if (e.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName || "")) { e.preventDefault(); input.focus(); }
        if (e.key === "Escape" && document.activeElement === input) input.blur();
      });
    }

    const accountBtn = header.querySelector("[data-account]");
    const accountMenu = header.querySelector("[data-account-menu]");
    const avatar = header.querySelector("[data-avatar]");
    const label = header.querySelector("[data-account-label]");
    const next = encodeURIComponent(here);
    const paintSignedOut = () => {
      avatar.textContent = "·";
      label.textContent = "Sign in";
      accountMenu.innerHTML = `<a href="/auth/apixis/start?next=${next}">Sign in with Apixis</a><a href="/login">Existing account: email link or password</a>`;
    };
    accountBtn.addEventListener("click", () => {
      const open = accountMenu.classList.toggle("hidden");
      accountBtn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", (e) => { if (!accountBtn.contains(e.target) && !accountMenu.contains(e.target)) accountMenu.classList.add("hidden"); });
    if (!getToken()) paintSignedOut();
    else {
      loadMe().then((me) => {
        if (!me) return paintSignedOut();
        avatar.textContent = initials(me.user?.email);
        label.textContent = me.tenant?.name || me.user?.email || "Account";
        accountMenu.innerHTML = `
          <div class="who">${me.user?.email || ""}<br><span class="dim">${me.tenant?.name || me.tenant?.slug || ""} · ${me.role || "member"}</span></div>
          <a href="/fleet">Your fleet &amp; ingest keys</a>
          <a href="/pricing">Plan &amp; billing</a>
          ${me.admin ? '<a href="/admin">Support queue (owner)</a>' : ""}
          <a href="https://www.apixis.dev/enter?from=geoxis" target="_blank" rel="noopener">Enter the Apixis world ↗</a>
          <button type="button" data-signout>Sign out</button>`;
        accountMenu.querySelector("[data-signout]").addEventListener("click", () => { clearSession(); location.href = "/"; });
        window.dispatchEvent(new CustomEvent("gx:me", { detail: me }));
      }).catch(paintSignedOut);
    }
  }

  const footer = document.querySelector("footer[data-shell-footer]");
  if (footer) {
    footer.className = "gx-footer";
    footer.innerHTML = `
      <div class="gx-footer-inner">
        <div data-ixis-companies></div>
        <span class="legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/support">Support</a><span class="dim">© Apixis Dev LLC</span></span>
      </div>`;
    renderIxisCompanies(footer);
  }
}

export function toast(text, kind = "info", ttl = 4200) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; document.body.append(stack); }
  const el = document.createElement("div");
  el.className = `toast${kind === "error" ? " toast-error" : ""}`;
  el.textContent = text;
  stack.append(el);
  setTimeout(() => el.remove(), ttl);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountShell());
else mountShell();

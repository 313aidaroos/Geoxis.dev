// Other Ixis companies (2026-09-29, Geoxis Lead / Grok). The ONE place the list lives:
// edit a URL here and every Geoxis footer updates. Geoxis itself is intentionally left out.
// Renders plain links into any element with a `data-ixis-companies` attribute.
export const IXIS_COMPANIES = [
  // 2026-10-04 (Geoxis Lead / Grok, hub order): full family list, matching Rawixis.dev's footer
  // (lib/marketing/ixis-companies.ts) and this site's /companies page (same names, URLs, order),
  // minus Geoxis itself. Nursery Toons and Qahwah World stay out (Awad, 9/29).
  { name: "Apixis", url: "https://www.apixis.dev" },
  { name: "Apixis Wallet", url: "https://apixis-wallet.vercel.app" },
  { name: "Socixis", url: "https://socixis.dev" },
  { name: "Lyrixis", url: "https://lyrixis.vercel.app" },
  { name: "Pinixis", url: "https://pinixis.vercel.app" },
  { name: "Renoxis", url: "https://renoxis.dev" },
  { name: "Contraxis", url: "https://contraxis-dev.vercel.app" },
  { name: "Deduxis", url: "https://deduxis.vercel.app" },
  { name: "Rawixis", url: "https://rawixis.vercel.app" },
  { name: "Halaxis", url: "https://halaxis.vercel.app" },
  { name: "Launchixis", url: "https://launchixis.vercel.app" },
  { name: "Recovra", url: "https://recovra-three.vercel.app" },
  { name: "Ominix", url: "https://ominix-app.vercel.app" },
  { name: "Wattixis", url: "https://wattixis.vercel.app" },
];

export function renderIxisCompanies(root = document) {
  root.querySelectorAll("[data-ixis-companies]").forEach((el) => {
    el.replaceChildren(
      ...IXIS_COMPANIES.map(({ name, url }) => {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = name;
        // Same muted link style as the sidebar nav (Login / Support / Admin); py-1 keeps taps easy on mobile.
        a.className = "ix-link";
        return a;
      }),
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => renderIxisCompanies());
} else {
  renderIxisCompanies();
}

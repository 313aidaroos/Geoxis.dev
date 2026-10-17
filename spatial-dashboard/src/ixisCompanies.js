// Other Ixis companies (2026-09-29, Geoxis Lead / Grok). The ONE place the list lives:
// edit a URL here and every Geoxis footer updates. Geoxis itself is intentionally left out.
// Renders plain links into any element with a `data-ixis-companies` attribute.
export const IXIS_COMPANIES = [
  // 2026-10-04 (Geoxis Lead / Grok, hub order): full family list, matching Rawixis.dev's footer
  // (lib/marketing/ixis-companies.ts) and this site's /companies page (same names, URLs, order),
  // minus Geoxis itself. Nursery Toons and Qahwah World stay out (Awad, 9/29).
  { name: "Apixis", url: "https://www.apixis.dev" },
  { name: "Apixis Wallet", url: "https://wallet.apixis.dev" },
  { name: "Socixis", url: "https://socixis.dev" },
  { name: "Lyrixis", url: "https://lyrixis.apixis.dev" },
  { name: "Pinixis", url: "https://pinixis.dev" },
  { name: "Renoxis", url: "https://renoxis.dev" },
  { name: "Contraxis", url: "https://contraxis.dev" },
  { name: "Deduxis", url: "https://deduxis.apixis.dev" },
  { name: "Rawixis", url: "https://rawixis.dev" },
  { name: "Halaxis", url: "https://halaxis.apixis.dev" },
  { name: "Launchixis", url: "https://launchixis.apixis.dev" },
  { name: "Recovra", url: "https://recovra-three.vercel.app" },
  { name: "Ominixis", url: "https://ominixis.apixis.dev" },
  { name: "Wattixis", url: "https://wattixis.apixis.dev" },
  { name: "Newsxis", url: "https://newsxis.apixis.dev" },
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

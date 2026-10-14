import { defineConfig } from "vite";
import { resolve } from "path";
import cesium from "vite-plugin-cesium";
import { snapshot } from "./lib/fleetEngine.js";

function geoxisApi() {
  return {
    name: "geoxis-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/assets") return next();
        try {
          const body = await snapshot();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(err?.message || err) }));
        }
      });
    },
  };
}

function cesiumInBody() {
  return {
    name: "geoxis-cesium-body",
    transformIndexHtml(html) {
      const withoutHeadCesium = html.replace(
        /<script src="[^"]*Cesium\.js"><\/script>\s*/g,
        "",
      );
      if (withoutHeadCesium.includes("Cesium.js")) return withoutHeadCesium;
      return withoutHeadCesium.replace(
        '<script type="module"',
        '<script src="/cesium/Cesium.js" defer></script>\n  <script type="module"',
      );
    },
  };
}

export default defineConfig({
  plugins: [cesium(), geoxisApi(), cesiumInBody()],
  server: { port: 5173, open: false },
  preview: { port: 4173 },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        support: resolve(__dirname, "support.html"),
        admin: resolve(__dirname, "admin.html"),
        // 2026-10-06 (Claude): these three were never built, so /pricing, /set-password and the
        // magic-link callback returned 404 in production (flagged by Grok on 2026-09-27).
        pricing: resolve(__dirname, "pricing.html"),
        track: resolve(__dirname, "track.html"),
        setPassword: resolve(__dirname, "set-password.html"),
        authCallback: resolve(__dirname, "auth/callback.html"),
        // 2026-10-14 (Geoxis Lead / Grok): draft legal pages.
        terms: resolve(__dirname, "terms.html"),
        privacy: resolve(__dirname, "privacy.html"),
      },
    },
  },
});

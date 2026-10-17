import { defineConfig } from "vite";
import { resolve } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import cesium from "vite-plugin-cesium";

// Dev only: serve every Vercel function under api/ so `vite` behaves like production
// (/api/assets, /api/air, /api/ships, /api/aircraft, /api/config, /api/me, …).
function geoxisApi() {
  return {
    name: "geoxis-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0] || "";
        if (!path.startsWith("/api/")) return next();
        const rel = path.slice(5).replace(/\/+$/, "").replace(/[^a-zA-Z0-9/_-]/g, "");
        const file = resolve(__dirname, "api", `${rel}.js`);
        if (!rel || !existsSync(file)) return next();
        try {
          const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
          // Express-style helpers a few handlers use.
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (body) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); };
          await mod.default(req, res);
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
      const withoutHeadCesium = html.replace(/<script src="[^"]*Cesium\.js"><\/script>\s*/g, "");
      if (withoutHeadCesium.includes("Cesium.js")) return withoutHeadCesium;
      return withoutHeadCesium.replace('<script type="module"', '<script src="/cesium/Cesium.js" defer></script>\n  <script type="module"');
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
        pricing: resolve(__dirname, "pricing.html"),
        track: resolve(__dirname, "track.html"),
        fleet: resolve(__dirname, "fleet.html"),
        setPassword: resolve(__dirname, "set-password.html"),
        authCallback: resolve(__dirname, "auth/callback.html"),
        terms: resolve(__dirname, "terms.html"),
        privacy: resolve(__dirname, "privacy.html"),
      },
    },
  },
});

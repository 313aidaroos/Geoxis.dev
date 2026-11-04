import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const pages = ["index.html", "login.html", "support.html", "admin.html", "pricing.html", "set-password.html", "auth/callback.html", "track.html", "fleet.html", "terms.html", "privacy.html"];
for (const page of pages) {
  const html = await readFile(resolve("dist", page), "utf8");
  if (!["companies.html", "feed.html"].includes(page) && html.includes("cdn.tailwindcss.com")) throw new Error(`${page}: runtime Tailwind CDN`);
  if (html.includes('src="/src/') || html.includes('href="/src/')) throw new Error(`${page}: unbuilt source reference`);
}
await access(resolve("dist/cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml"));
async function checkApis(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await checkApis(path);
    else if (entry.name.endsWith(".js")) {
      const module = await import(pathToFileURL(path));
      if (typeof module.default !== "function") throw new Error(`${path}: missing handler`);
    }
  }
}
await checkApis(resolve("api"));
console.log(`Verified ${pages.length} built pages, bundled globe imagery, and all API imports.`);

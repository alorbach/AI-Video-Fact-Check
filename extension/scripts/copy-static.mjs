import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of [
  "manifest.json",
  "background.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "options.html",
  "options.js",
  "_locales",
  "icons",
]) {
  cpSync(join(root, name), join(dist, name), { recursive: true });
}

console.log("Built extension/dist — load unpacked in chrome://extensions");

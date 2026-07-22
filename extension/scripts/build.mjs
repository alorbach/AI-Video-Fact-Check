import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const sharedAlias = {
  "@ai-video-fact-check/shared": join(root, "../shared/src/index.ts"),
};

await esbuild.build({
  entryPoints: {
    background: join(root, "src/background.ts"),
  },
  bundle: true,
  outdir: dist,
  // Classic SW script — avoid MV3 "type: module" worker quirks ("No SW").
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  alias: sharedAlias,
  logLevel: "info",
});

await esbuild.build({
  entryPoints: {
    sidepanel: join(root, "src/sidepanel.ts"),
    options: join(root, "src/options.ts"),
  },
  bundle: true,
  outdir: dist,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  alias: sharedAlias,
  logLevel: "info",
});

await esbuild.build({
  entryPoints: [join(root, "src/content.ts")],
  bundle: true,
  outfile: join(dist, "content.js"),
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  alias: sharedAlias,
  logLevel: "info",
});

await esbuild.build({
  entryPoints: [join(root, "src/chatInject.ts")],
  bundle: true,
  outfile: join(dist, "chatInject.js"),
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  alias: sharedAlias,
  logLevel: "info",
});

for (const name of [
  "manifest.json",
  "sidepanel.html",
  "sidepanel.css",
  "options.html",
  "_locales",
  "icons",
]) {
  cpSync(join(root, name), join(dist, name), { recursive: true });
}

console.log("Built extension/dist — load unpacked in chrome://extensions");

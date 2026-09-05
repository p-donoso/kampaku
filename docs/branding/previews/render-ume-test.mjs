#!/usr/bin/env node
/** Isolated ume render for visual QA — node kampaku-docs/branding/previews/render-ume-test.mjs */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { umeBlossomSvg } from "../../../kampaku-web/src/design/ume-blossom.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const gold = "#e8c547";
const brand = "#c93c35";
const brandLight = "#e8635a";
const bg = "#0a0908";

const blossom = umeBlossomSvg({ strokeWidth: 0.65, gold, brand, brandLight });

function buildSvg(zoom = 1) {
  const size = 400 * zoom;
  const frame = `
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <rect x="${40 * zoom}" y="${40 * zoom}" width="${320 * zoom}" height="${320 * zoom}" fill="none" stroke="${gold}" stroke-width="${8 * zoom}"/>
  <rect x="${56 * zoom}" y="${56 * zoom}" width="${288 * zoom}" height="${288 * zoom}" fill="none" stroke="${brand}" stroke-width="${3 * zoom}"/>
`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${frame}
  ${blossom}
</svg>`;
}

for (const [name, zoom] of [
  ["ume-test", 1],
  ["ume-test-zoom", 4],
]) {
  const svgPath = join(outDir, `${name}.svg`);
  const pngPath = join(outDir, `${name}.png`);
  writeFileSync(svgPath, buildSvg(zoom));
  execSync(`npx --yes @resvg/resvg-js-cli "${svgPath}" "${pngPath}"`, { stdio: "inherit" });
  console.log("Wrote", pngPath);
}

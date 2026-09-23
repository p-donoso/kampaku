#!/usr/bin/env node
/** Generate the UME mark preview for visual QA. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { umeBlossomSvg } from "../../../apps/web/src/design/ume-blossom.mjs";
import { readImperialCinnabar } from "./brand-palette.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const palette = readImperialCinnabar("dark");
const gold = palette["--brand-gold"];
const brand = palette["--brand"];
const brandLight = palette["--brand-petal-light"];
const bg = palette["--bg-base"];

const blossom = umeBlossomSvg({ strokeWidth: 0.65, gold, brand, brandLight });

const cornerMarks = (stroke) => `
  <path d="M11 11h4M11 11v4M89 11h-4M89 11v4M11 89h4M11 89v-4M89 89h-4M89 89v-4"
    fill="none" stroke="${stroke}" stroke-width="0.8" stroke-linecap="butt"/>`;

function buildSvg(zoom = 1) {
  const size = 400 * zoom;
  const frame = `
  <rect width="100" height="100" fill="${bg}"/>
  <rect x="3" y="3" width="94" height="94" fill="none" stroke="${gold}" stroke-width="3"/>
  <rect x="8" y="8" width="84" height="84" fill="none" stroke="${brand}" stroke-width="1.25"/>
  ${cornerMarks(brand)}
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

#!/usr/bin/env node
/** Generate the current Kampaku brand and operator-shell examples. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { umeBlossomSvg } from "../../../apps/web/src/design/ume-blossom.mjs";
import { readImperialCinnabar } from "./brand-palette.mjs";

const outDir = dirname(fileURLToPath(import.meta.url));
const mark = (x, y, size, theme) => {
  const p = readImperialCinnabar(theme);
  const t = { brand: p["--brand"], light: p["--brand-petal-light"], gold: p["--brand-gold"] };
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" fill="none" stroke="${t.gold}" stroke-width="3"/><rect x="8" y="8" width="84" height="84" fill="none" stroke="${t.brand}" stroke-width="1.25"/><path d="M11 11h4M11 11v4M89 11h-4M89 11v4M11 89h4M11 89v-4M89 89h-4M89 89v-4" fill="none" stroke="${t.brand}" stroke-width="0.8" stroke-linecap="butt"/>${umeBlossomSvg({ strokeWidth: 0.65, gold: t.gold, brand: t.brand, brandLight: t.light })}</svg>`;
};

function buildSvg(theme) {
  const dark = theme === "dark";
  const p = readImperialCinnabar(dark ? "dark" : "light");
  const c = { bg: p["--bg-base"], surface: p["--bg-surface"], raised: p["--bg-elevated"], line: p["--border-default"], text: p["--text-primary"], muted: p["--text-muted"], brand: p["--brand"], gold: p["--brand-gold"], good: p["--success"], warn: p["--warning"] };
  const text = (x, y, value, size = 14, fill = c.text, weight = 400) => `<text x="${x}" y="${y}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${value}</text>`;
  const panel = (x, y, w, h, title, body, accent = c.brand) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${c.surface}" stroke="${c.line}"/><rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${accent}"/>${text(x + 22, y + 30, title, 15, c.text, 650)}${text(x + 22, y + 58, body, 12, c.muted)}`;
  const station = (x, y, label, status, color) => `<circle cx="${x}" cy="${y - 5}" r="5" fill="${color}"/>${text(x + 15, y, label, 13, c.text, 550)}${text(x + 15, y + 21, status, 11, c.muted)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <rect width="1440" height="900" fill="${c.bg}"/>
  <rect x="0" y="0" width="1440" height="72" fill="${c.surface}" stroke="${c.line}"/>
  ${mark(28, 12, 48, theme)}${text(88, 36, "Kampaku", 19, c.gold, 700)}${text(88, 55, "Control Plane", 11, c.muted)}
  ${text(1120, 34, "PERSONAL SOFTWARE FACTORY", 10, c.muted, 650)}
  <rect x="0" y="72" width="250" height="828" fill="${c.surface}" stroke="${c.line}"/>
  ${text(28, 112, "WORKSPACE", 10, c.muted, 700)}
  ${text(28, 154, "Overview", 14, c.text, 600)}
  ${text(28, 198, "Projects", 14, c.brand, 650)}
  ${text(28, 242, "Agents", 14, c.text, 600)}
  ${text(28, 286, "Settings", 14, c.text, 600)}
  ${text(28, 820, "Evidence-led execution", 11, c.muted)}
  ${text(28, 842, "bounded · durable · honest", 10, c.muted)}
  ${text(292, 132, "Project overview", 28, c.text, 650)}
  ${text(292, 162, "Voice Language Trainer · work order #042", 13, c.muted)}
  ${text(1190, 132, "ACTIVE", 11, c.good, 700)}
  ${panel(292, 202, 340, 128, "Work order", "Build and verify the next learning slice", c.brand)}
  ${panel(658, 202, 340, 128, "Inspection", "12 / 14 criteria verified", c.gold)}
  ${panel(1024, 202, 340, 128, "Shipment", "No release claimed yet", c.warn)}
  <rect x="292" y="362" width="706" height="320" rx="10" fill="${c.surface}" stroke="${c.line}"/>
  ${text(318, 402, "Factory line", 17, c.text, 650)}
  ${text(318, 428, "One order, visible gates, independent inspection", 12, c.muted)}
  <line x1="350" y1="500" x2="920" y2="500" stroke="${c.line}" stroke-width="4"/>
  ${station(370, 485, "Intake", "complete", c.good)}${station(510, 485, "Planning", "approved", c.good)}${station(650, 485, "Stations", "staffed", c.good)}${station(790, 485, "Execution", "running", c.brand)}${station(930, 485, "Inspection", "pending", c.warn)}
  ${text(318, 598, "Current slice", 12, c.muted, 650)}
  ${text(318, 625, "Implement spaced-repetition review scheduling", 14, c.text, 550)}
  ${text(318, 653, "Owner: project lead · Evidence: repository-native checks", 12, c.muted)}
  <rect x="1024" y="362" width="340" height="320" rx="10" fill="${c.surface}" stroke="${c.line}"/>
  ${text(1050, 402, "Shared knowledge", 17, c.text, 650)}
  ${text(1050, 428, "Verified project context", 12, c.muted)}
  ${text(1050, 478, "Repository", 11, c.muted, 650)}${text(1050, 501, "voice-language-trainer", 14, c.text, 550)}
  ${text(1050, 548, "Toolchain", 11, c.muted, 650)}${text(1050, 571, "discovered · checks verified", 14, c.good, 550)}
  ${text(1050, 618, "Last inspection", 11, c.muted, 650)}${text(1050, 641, "Today · 14:32", 14, c.text, 550)}
  <rect x="292" y="716" width="1072" height="108" rx="10" fill="${c.raised}" stroke="${c.line}"/>
  ${text(318, 754, "Bounded authority", 14, c.text, 650)}${text(318, 780, "The operator sets intent. Agents plan and execute inside explicit project, task, skill, and sandbox boundaries.", 12, c.muted)}
  ${text(318, 802, "Claims are not completion; evidence is.", 12, c.gold, 600)}
</svg>`;
}

for (const theme of ["dark", "light"]) {
  const svgPath = join(outDir, `brand-preview-${theme}.svg`);
  const pngPath = join(outDir, `brand-preview-${theme}.png`);
  writeFileSync(svgPath, buildSvg(theme), "utf8");
  execSync(`npx --yes @resvg/resvg-js-cli "${svgPath}" "${pngPath}"`, { stdio: "inherit" });
  console.log(`Wrote ${svgPath}`);
  console.log(`Wrote ${pngPath}`);
}

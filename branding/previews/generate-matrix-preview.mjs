#!/usr/bin/env node
/**
 * Self-contained matrix preview (SVG + PNG). Palettes: K-B, K-I only.
 * Run: node kampaku-docs/branding/previews/generate-matrix-preview.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  UME_ROTATION_DEG,
  umeBlossomSvg,
} from "../../../kampaku-web/src/design/ume-blossom.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const PALETTES = {
  B: {
    label: "Command Tent",
    dark: {
      bg: "#0c0a09",
      surface: "#1c1917",
      elevated: "#292524",
      border: "#292524",
      text: "#eceae8",
      muted: "#a8a29e",
      brand: "#b8956a",
      brandLight: "#d4b896",
      gold: "#d4b896",
      success: "#7a9e7e",
      warning: "#c9924a",
      info: "#7a94a8",
    },
    light: {
      bg: "#faf8f5",
      surface: "#ffffff",
      elevated: "#f0ece6",
      border: "#e7e5e4",
      text: "#1c1917",
      muted: "#57534e",
      brand: "#92704a",
      brandLight: "#b8956a",
      gold: "#b8956a",
      success: "#4a7a50",
      warning: "#a6712e",
      info: "#4a6d85",
    },
  },
  I: {
    label: "Imperial Cinnabar",
    dark: {
      bg: "#0a0908",
      surface: "#121010",
      elevated: "#1c1816",
      border: "#2a2320",
      text: "#f5f0eb",
      muted: "#8a7f78",
      brand: "#c93c35",
      brandLight: "#e8635a",
      gold: "#e8c547",
      success: "#6d9a72",
      warning: "#e07840",
      info: "#8a9eb8",
    },
    light: {
      bg: "#faf6f0",
      surface: "#ffffff",
      elevated: "#f3ece3",
      border: "#e5dcd4",
      text: "#1a1210",
      muted: "#9a8a82",
      brand: "#a82f28",
      brandLight: "#d04a42",
      gold: "#c4940a",
      success: "#4a7a50",
      warning: "#c45a20",
      info: "#4a6d85",
    },
  },
};

function cornerMarks(gold) {
  const s = 4;
  const i = 11;
  const pts = [
    [i, i, i + s, i],
    [i, i, i, i + s],
    [100 - i, i, 100 - i - s, i],
    [100 - i, i, 100 - i, i + s],
    [i, 100 - i, i + s, 100 - i],
    [i, 100 - i, i, 100 - i - s],
    [100 - i, 100 - i, 100 - i - s, 100 - i],
    [100 - i, 100 - i, 100 - i, 100 - i - s],
  ];
  return `<g stroke="${gold}" stroke-width="0.85" stroke-linecap="square">${pts.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join("")}</g>`;
}

function sealInner(stamped, brand, brandLight, gold, surface, sw = 0.65) {
  const filter = stamped
    ? `<filter id="sf"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.65"/></filter>`
    : "";
  return `${filter}<g color="${brand}" ${stamped ? 'filter="url(#sf)"' : ""}><rect x="3" y="3" width="94" height="94" fill="none" stroke="${gold}" stroke-width="3" opacity="${stamped ? 0.92 : 1}"/><rect x="8" y="8" width="84" height="84" fill="none" stroke="${brand}" stroke-width="1.25" opacity="${stamped ? 0.82 : 1}"/>${cornerMarks(gold)}${umeBlossomSvg({ strokeWidth: sw, gold, brand, brandLight, opacity: stamped ? 0.9 : 1 })}</g>`;
}

function sealAt(x, y, size, stamped, t) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${sealInner(stamped, t.brand, t.brandLight, t.gold, t.surface)}</svg>`;
}

function panelSample(id, palette, theme, x, y, w, h) {
  const t = PALETTES[palette][theme];
  return `
  <g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
    <text x="16" y="28" font-family="ui-monospace,monospace" font-size="14" font-weight="600" fill="${t.gold}">${id}</text>
    <text x="16" y="44" font-family="system-ui,sans-serif" font-size="11" fill="${t.muted}">${PALETTES[palette].label} · ${theme}</text>
    <!-- sidebar -->
    <rect x="16" y="58" width="88" height="${h - 74}" rx="8" fill="${t.surface}" stroke="${t.border}"/>
    ${sealAt(28, 68, 44, false, t)}
    <text x="34" y="128" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="${t.gold}">Kampaku</text>
    <text x="34" y="140" font-family="system-ui,sans-serif" font-size="7" fill="${t.muted}">Control Plane</text>
    <rect x="24" y="150" width="72" height="18" rx="4" fill="color-mix(in srgb, ${t.brand} 14%, transparent)" stroke="${t.brand}" stroke-width="0.5"/>
    <text x="30" y="162" font-family="system-ui,sans-serif" font-size="8" fill="${t.text}">Dashboard</text>
    <text x="30" y="182" font-family="system-ui,sans-serif" font-size="8" fill="${t.muted}">Projects</text>
    <text x="30" y="198" font-family="system-ui,sans-serif" font-size="8" fill="${t.muted}">Agents</text>
    <!-- main -->
    <rect x="112" y="58" width="${w - 128}" height="${h - 74}" rx="8" fill="${t.surface}" stroke="${t.border}"/>
    <text x="124" y="78" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="${t.text}">Dashboard</text>
    <text x="124" y="92" font-family="system-ui,sans-serif" font-size="9" fill="${t.muted}">Project management and execution</text>
    <!-- stat grid -->
    ${[
      ["Core", "Online", t.success],
      ["Projects", "3", t.text],
      ["Questions", "1", t.warning],
      ["Blockers", "0", t.text],
    ]
      .map(([lbl, val, col], i) => {
        const cx = 124 + (i % 2) * 118;
        const cy = 102 + Math.floor(i / 2) * 44;
        return `<rect x="${cx}" y="${cy}" width="108" height="36" rx="6" fill="${t.elevated}" stroke="${t.border}"/><text x="${cx + 8}" y="${cy + 14}" font-size="8" fill="${t.muted}">${lbl}</text><text x="${cx + 8}" y="${cy + 30}" font-size="11" font-weight="600" fill="${col}">${val}</text>`;
      })
      .join("")}
    <!-- attention -->
    <rect x="124" y="192" width="${w - 152}" height="36" rx="6" fill="color-mix(in srgb, ${t.warning} 10%, transparent)" stroke="color-mix(in srgb, ${t.warning} 40%, ${t.border})"/>
    <text x="134" y="208" font-size="8" font-weight="600" fill="${t.warning}">NEEDS ATTENTION</text>
    <text x="134" y="222" font-size="9" fill="${t.muted}">Approve deployment to staging?</text>
    <!-- table -->
    <rect x="124" y="236" width="${w - 152}" height="56" rx="6" fill="${t.bg}" stroke="${t.border}"/>
    <text x="134" y="252" font-size="7" font-weight="600" fill="${t.muted}">PROJECT</text>
    <text x="224" y="252" font-size="7" font-weight="600" fill="${t.muted}">STATUS</text>
    <text x="294" y="252" font-size="7" font-weight="600" fill="${t.muted}">TASKS</text>
    <line x1="124" y1="258" x2="${w - 28}" y2="258" stroke="${t.border}"/>
    <text x="134" y="272" font-size="9" fill="${t.text}">kampaku-web</text>
    <text x="224" y="272" font-size="9" fill="${t.success}">Running</text>
    <text x="294" y="272" font-size="9" fill="${t.muted}">12</text>
    <text x="134" y="286" font-size="9" fill="${t.text}">my-app</text>
    <text x="224" y="286" font-size="9" fill="${t.muted}">Idle</text>
    <text x="294" y="286" font-size="9" fill="${t.muted}">4</text>
    <!-- floating panel -->
    <rect x="124" y="300" width="${w - 152}" height="72" rx="6" fill="${t.elevated}" stroke="${t.border}"/>
    <text x="134" y="316" font-size="10" font-weight="600" fill="${t.text}">Project detail</text>
    <text x="134" y="332" font-size="8" fill="${t.brand}">Summary</text>
    <text x="184" y="332" font-size="8" fill="${t.muted}">Tasks</text>
    <text x="224" y="332" font-size="8" fill="${t.muted}">Wiki</text>
    <line x1="134" y1="338" x2="170" y2="338" stroke="${t.brand}" stroke-width="1.5"/>
    <text x="134" y="356" font-size="9" fill="${t.muted}">Execution phase: planning</text>
    <rect x="134" y="364" width="72" height="18" rx="4" fill="${t.brand}"/>
    <text x="148" y="377" font-size="8" font-weight="600" fill="${t.bg}">Run plan</text>
  </g>`;
}

function buildMatrixSvg(theme) {
  const bg = theme === "dark" ? "#09090b" : "#f0f0f2";
  const title = theme === "dark" ? "#fafafa" : "#18181b";
  const sub = theme === "dark" ? "#71717a" : "#52525b";
  const pw = 560;
  const ph = 400;

  const heroes = ["B", "I"]
    .map((p, i) => {
      const t = PALETTES[p][theme];
      const x = 40 + i * 580;
      return `
      <text x="${x}" y="118" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="${sub}">K-${p} — ${PALETTES[p].label} (stamped)</text>
      ${sealAt(x, 128, 100, true, t)}
      <text x="${x + 112}" y="175" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="${t.gold}">Kampaku</text>
      <text x="${x + 112}" y="192" font-family="system-ui,sans-serif" font-size="10" fill="${t.muted}">Control Plane</text>
      ${sealAt(x + 112, 205, 40, false, t)}
      ${sealAt(x + 160, 205, 56, false, t)}
      ${sealAt(x + 224, 205, 72, false, t)}
    `;
    })
    .join("");

  const panels = ["B", "I"]
    .map((p, i) => panelSample(`K-${p}`, p, theme, 40 + i * (pw + 40), 300, pw, ph))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="740" viewBox="0 0 1200 740">
  <rect width="1200" height="740" fill="${bg}"/>
  <text x="40" y="44" font-family="system-ui,sans-serif" font-size="24" font-weight="600" fill="${title}">Kampaku — Palette Matrix (${theme})</text>
  <text x="40" y="68" font-family="system-ui,sans-serif" font-size="13" fill="${sub}">Ume seal (+${UME_ROTATION_DEG}°) · Pick K-B or K-I · Self-contained export</text>
  ${heroes}
  <text x="40" y="288" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="${sub}">UI PANEL SAMPLES</text>
  ${panels}
  <text x="40" y="720" font-family="system-ui,sans-serif" font-size="10" fill="${sub}">Regenerate: node kampaku-docs/branding/previews/generate-matrix-preview.mjs</text>
</svg>`;
}

for (const theme of ["dark", "light"]) {
  const svgPath = join(OUT_DIR, `matrix-preview-${theme}.svg`);
  writeFileSync(svgPath, buildMatrixSvg(theme), "utf8");
  console.log("Wrote", svgPath);
  try {
    const pngPath = join(OUT_DIR, `matrix-preview-${theme}.png`);
    execSync(`npx --yes @resvg/resvg-js-cli "${svgPath}" "${pngPath}"`, { stdio: "inherit" });
    console.log("Wrote", pngPath);
  } catch (e) {
    console.warn("PNG export failed for", theme);
  }
}

console.log("Done.");

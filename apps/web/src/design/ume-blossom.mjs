/**
 * Ume blossom SVG layers — single source for React + static previews.
 */
import {
  fmt,
  goldStrokeWidth,
  PETAL_ANGLES,
  PETAL_OVERLAP_ORDER,
  petalGradientRadius,
  scaledCenter,
  scaledPetal,
  UME_GOLD_RIM_RX,
  UME_GOLD_RIM_RY,
  UME_PETAL_GRADIENT_ID,
  UME_RAY_TIP_GAP,
  UME_ROTATION_DEG,
  umeDetailScale,
} from "./ume-mark.shared.mjs";
import { centerRayTaperPath, petalSpiralGoldPath } from "./ume-blossom-paths.mjs";

function petalGradientDefsSvg(brand, brandLight) {
  const r = petalGradientRadius();
  return `<radialGradient id="${UME_PETAL_GRADIENT_ID}" cx="0" cy="0" r="${fmt(r)}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${brand}"/><stop offset="55%" stop-color="${brand}"/><stop offset="100%" stop-color="${brandLight}"/></radialGradient>`;
}

/**
 * @param {{ strokeWidth?: number; gold: string; brand: string; brandLight: string; groupTransform?: string; opacity?: number }} opts
 */
export function umeBlossomLayersSvg({
  strokeWidth = 0.6,
  gold,
  brand,
  brandLight,
  groupTransform = "",
  opacity = 1,
}) {
  const inner = strokeWidth * 0.5;
  const goldStroke = goldStrokeWidth(strokeWidth);
  const center = scaledCenter();
  const ds = umeDetailScale();
  const op = opacity < 1 ? ` opacity="${opacity}"` : "";
  const petal = scaledPetal();
  const orx = petal.rx + UME_GOLD_RIM_RX;
  const ory = petal.ry + UME_GOLD_RIM_RY;
  const fillPad = goldStroke * 0.45;
  const rayHalfW = goldStroke * 0.32;
  const grad = `url(#${UME_PETAL_GRADIENT_ID})`;

  const fills = PETAL_ANGLES.map(
    (angle) =>
      `<ellipse cx="0" cy="${fmt(petal.cy)}" rx="${fmt(petal.rx + fillPad)}" ry="${fmt(petal.ry + fillPad)}" transform="rotate(${angle})" fill="${grad}" stroke="none"/>`,
  ).join("");

  const goldPath = petalSpiralGoldPath(petal.cy, orx, ory, center.r);
  const rims = PETAL_OVERLAP_ORDER.map(
    (angle) =>
      `<path d="${goldPath}" transform="rotate(${angle})" fill="none" stroke="${gold}" stroke-width="${goldStroke}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="5"/>`,
  ).join("");

  const creases = PETAL_ANGLES.map(
    (angle) =>
      `<line x1="0" y1="${fmt(-center.r - 1)}" x2="0" y2="${fmt(-center.r - 4 * ds)}" transform="rotate(${angle})" stroke="${brand}" stroke-width="${strokeWidth * 0.35}" stroke-linecap="butt" opacity="0.2"/>`,
  ).join("");

  const stamens = PETAL_ANGLES.map(
    (angle) =>
      `<line x1="0" y1="${fmt(-2 * ds)}" x2="0" y2="${fmt(-9.5 * ds)}" transform="rotate(${angle})" stroke="${brand}" stroke-width="${strokeWidth * 0.75}" stroke-linecap="butt"/>`,
  ).join("");

  const rayPath = centerRayTaperPath(center.r, petal.tipY, rayHalfW, UME_RAY_TIP_GAP);
  const rays = PETAL_ANGLES.map(
    (angle) =>
      `<path d="${rayPath}" transform="rotate(${angle})" fill="${gold}" stroke="none"/>`,
  ).join("");

  const hub = `<circle r="${fmt(center.r)}" fill="${brand}" stroke="${gold}" stroke-width="${goldStroke}"/><circle r="${fmt(center.innerR)}" fill="none" stroke="${brand}" stroke-width="${inner}" stroke-linecap="butt" opacity="0.85"/>`;

  return `<g transform="${groupTransform}" stroke="${brand}"${op}>${fills}${rims}${creases}${stamens}${rays}${hub}</g>`;
}

export function umeBlossomSvg(opts) {
  const defs = petalGradientDefsSvg(opts.brand, opts.brandLight);
  const layers = umeBlossomLayersSvg({
    ...opts,
    groupTransform: `translate(50 50) rotate(${UME_ROTATION_DEG})`,
  });
  return `<defs>${defs}</defs>${layers}`;
}

export { UME_ROTATION_DEG };

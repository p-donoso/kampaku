/** Flat ume blossom geometry — paths live in ume-blossom-paths.ts / ume-blossom.mjs */
export const UME_ROTATION_DEG = 11;

export const UME_PETAL_WIDTH_BOOST = 1.1;

export const UME_SCALE_RX = 1.4;
export const UME_SCALE_RY = 1.22;
export const UME_SCALE_CY = 1.3;
export const UME_SCALE_CENTER = 1.28;

export const PETAL_CY = -14;
export const PETAL_RX = 6.5;
export const PETAL_RY = 13;
export const PETAL_INNER_RX = 5.35;
export const PETAL_INNER_RY = 10.7;

export const PETAL_ANGLES = [0, 72, 144, 216, 288] as const;

/** Rim paint order — later petals stack over sector seams (clockwise spiral). */
export const PETAL_OVERLAP_ORDER = [144, 216, 288, 0, 72] as const;

export const UME_CENTER_R = 4.5;
export const UME_CENTER_INNER_R = 2.2;
export const UME_CENTER_RAY_LEN = 3.2;
/** Rays stop this fraction before the petal tip (0.15 = 15% gap). */
export const UME_RAY_TIP_GAP = 0.15;
export const UME_GOLD_RIM_RX = 0.28;
export const UME_GOLD_RIM_RY = 0.45;
export const UME_GOLD_STROKE_FACTOR = 1.44;

export const UME_PETAL_GRADIENT_ID = "ume-petal-fill";

export function fmt(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function scaledPetal() {
  const cy = PETAL_CY * UME_SCALE_CY;
  const rx = PETAL_RX * UME_SCALE_RX * UME_PETAL_WIDTH_BOOST;
  const ry = PETAL_RY * UME_SCALE_RY;
  const innerRx = PETAL_INNER_RX * UME_SCALE_RX * UME_PETAL_WIDTH_BOOST;
  const innerRy = PETAL_INNER_RY * UME_SCALE_RY;
  return { cy, rx, ry, innerRx, innerRy, tipY: cy - ry };
}

export function scaledCenter() {
  const s = UME_SCALE_CENTER;
  return {
    r: UME_CENTER_R * s,
    innerR: UME_CENTER_INNER_R * s,
    rayLen: UME_CENTER_RAY_LEN * s,
  };
}

export function goldStrokeWidth(baseStroke: number) {
  return baseStroke * UME_GOLD_STROKE_FACTOR;
}

export function umeDetailScale() {
  return (UME_SCALE_RX + UME_SCALE_RY + UME_SCALE_CY) / 3;
}

export function petalGradientRadius() {
  const { cy, ry } = scaledPetal();
  return Math.abs(cy) + ry + 1;
}

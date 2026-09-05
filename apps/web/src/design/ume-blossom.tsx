/**
 * Ume blossom SVG layers — React wrapper; path math in ume-blossom-paths.ts.
 */
import {
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
  goldStrokeWidth,
  umeDetailScale,
} from "./ume-mark";
import { centerRayTaperPath, petalSpiralGoldPath } from "./ume-blossom-paths";

export { centerRayTaperPath, petalSpiralGoldPath } from "./ume-blossom-paths";
export { PETAL_OVERLAP_ORDER } from "./ume-mark";

export type UmeBlossomLayersProps = {
  strokeWidth?: number;
  opacity?: number;
};

export function UmePetalGradientDefs() {
  const r = petalGradientRadius();
  return (
    <radialGradient
      id={UME_PETAL_GRADIENT_ID}
      cx="0"
      cy="0"
      r={r}
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0%" stopColor="var(--brand)" />
      <stop offset="55%" stopColor="var(--brand)" />
      <stop offset="100%" stopColor="var(--brand-petal-light)" />
    </radialGradient>
  );
}

export function UmeBlossomLayers({ strokeWidth = 0.6, opacity = 1 }: UmeBlossomLayersProps) {
  const innerStroke = strokeWidth * 0.5;
  const goldStroke = goldStrokeWidth(strokeWidth);
  const center = scaledCenter();
  const ds = umeDetailScale();
  const petal = scaledPetal();
  const orx = petal.rx + UME_GOLD_RIM_RX;
  const ory = petal.ry + UME_GOLD_RIM_RY;
  const fillPad = goldStroke * 0.45;
  const rayHalfW = goldStroke * 0.32;

  return (
    <g
      transform={`translate(50 50) rotate(${UME_ROTATION_DEG})`}
      stroke="currentColor"
      opacity={opacity}
    >
      {PETAL_ANGLES.map((angle) => (
        <ellipse
          key={`fill-${angle}`}
          cx="0"
          cy={petal.cy}
          rx={petal.rx + fillPad}
          ry={petal.ry + fillPad}
          transform={`rotate(${angle})`}
          fill={`url(#${UME_PETAL_GRADIENT_ID})`}
          stroke="none"
        />
      ))}

      {PETAL_OVERLAP_ORDER.map((angle) => {
        const goldPath = petalSpiralGoldPath(petal.cy, orx, ory, center.r);
        return (
          <path
            key={`rim-${angle}`}
            d={goldPath}
            transform={`rotate(${angle})`}
            fill="none"
            stroke="var(--brand-gold, transparent)"
            strokeWidth={goldStroke}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            strokeMiterlimit={5}
          />
        );
      })}

      {PETAL_ANGLES.map((angle) => (
        <line
          key={`c-${angle}`}
          x1="0"
          y1={-center.r - 1}
          x2="0"
          y2={-center.r - 4 * ds}
          transform={`rotate(${angle})`}
          stroke="var(--brand-deep, currentColor)"
          strokeWidth={strokeWidth * 0.35}
          strokeLinecap="butt"
          opacity={0.2}
          fill="none"
        />
      ))}

      {PETAL_ANGLES.map((angle) => (
        <line
          key={`s-${angle}`}
          x1="0"
          y1={-2 * ds}
          x2="0"
          y2={-9.5 * ds}
          transform={`rotate(${angle})`}
          stroke="var(--brand-deep, currentColor)"
          strokeWidth={strokeWidth * 0.75}
          strokeLinecap="butt"
          fill="none"
        />
      ))}

      {PETAL_ANGLES.map((angle) => {
        const rayPath = centerRayTaperPath(center.r, petal.tipY, rayHalfW, UME_RAY_TIP_GAP);
        return (
          <path
            key={`r-${angle}`}
            d={rayPath}
            transform={`rotate(${angle})`}
            fill="var(--brand-gold, transparent)"
            stroke="none"
          />
        );
      })}

      <circle
        r={center.r}
        fill="var(--brand)"
        stroke="var(--brand-gold, currentColor)"
        strokeWidth={goldStroke}
      />
      <circle
        r={center.innerR}
        fill="none"
        strokeWidth={innerStroke}
        strokeLinecap="butt"
        opacity={0.85}
      />
    </g>
  );
}

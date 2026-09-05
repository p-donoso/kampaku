/** Spiral rim paths — identical template per petal; paint order creates weave. */
import { fmt } from "./ume-mark";

const TIP_HALF_RAD = Math.PI / 5;
const TIP = -Math.PI / 2;

function ellipsePoint(rx: number, ry: number, cy: number, t: number) {
  return [rx * Math.cos(t), cy + ry * Math.sin(t)] as const;
}

function rayOuterEllipseHit(rx: number, ry: number, cy: number, rayAngle: number) {
  const cosA = Math.cos(rayAngle);
  const sinA = Math.sin(rayAngle);
  const a = (cosA * cosA) / (rx * rx) + (sinA * sinA) / (ry * ry);
  const b = (-2 * sinA * cy) / (ry * ry);
  const c = (cy * cy) / (ry * ry) - 1;
  const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  return [t * cosA, t * sinA] as const;
}

function ellipseParam(rx: number, ry: number, cy: number, x: number, y: number) {
  return Math.atan2((y - cy) / ry, x / rx);
}

function arcTo(fromT: number, toT: number, rx: number, ry: number, cy: number) {
  const [x2, y2] = ellipsePoint(rx, ry, cy, toT);
  let delta = toT - fromT;
  while (delta <= 0) delta += Math.PI * 2;
  const large = delta > Math.PI ? 1 : 0;
  return `A ${fmt(rx)} ${fmt(ry)} 0 ${large} 1 ${fmt(x2)} ${fmt(y2)}`;
}

/** Gold rim: tip arc + clockwise flank; left flank omitted (prior petal covers it). */
export function petalSpiralGoldPath(
  cy: number,
  orx: number,
  ory: number,
  centerR: number,
) {
  const leftEdge = TIP - TIP_HALF_RAD;
  const rightEdge = TIP + TIP_HALF_RAD;

  const [lx, ly] = rayOuterEllipseHit(orx, ory, cy, leftEdge);
  const [rx, ryPt] = rayOuterEllipseHit(orx, ory, cy, rightEdge);

  const tLeft = ellipseParam(orx, ory, cy, lx, ly);
  const tRight = ellipseParam(orx, ory, cy, rx, ryPt);

  const sinT = Math.min(1, Math.max(-1, (-centerR - cy) / ory));
  const tBot = Math.asin(sinT);

  return `M ${fmt(lx)} ${fmt(ly)} ${arcTo(tLeft, tRight, orx, ory, cy)} ${arcTo(tRight, tBot, orx, ory, cy)}`;
}

/** Tapered center ray as a 4-point wedge (wide base → sharp tip). */
export function centerRayTaperPath(
  centerR: number,
  tipY: number,
  baseHalfWidth: number,
  tipGap = 0.15,
) {
  const startY = -centerR;
  const endY = startY + (1 - tipGap) * (tipY - startY);
  const midY = startY + (endY - startY) * 0.55;
  const midHalfW = baseHalfWidth * 0.45;
  return [
    `M ${fmt(-baseHalfWidth)} ${fmt(startY)}`,
    `L ${fmt(-midHalfW)} ${fmt(midY)}`,
    `L 0 ${fmt(endY)}`,
    `L ${fmt(midHalfW)} ${fmt(midY)}`,
    `L ${fmt(baseHalfWidth)} ${fmt(startY)}`,
    "Z",
  ].join(" ");
}

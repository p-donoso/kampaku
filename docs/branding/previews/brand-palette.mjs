import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const palettePath = resolve(
  new URL("../../../apps/web/src/design/palettes/imperial-cinnabar.css", import.meta.url).pathname,
);
const source = readFileSync(palettePath, "utf8");

export function readImperialCinnabar(theme) {
  const match = source.match(
    new RegExp(`\\[data-palette="imperial-cinnabar"\\]\\[data-theme="${theme}"\\]\\]?[^{]*\\{([^}]+)\\}`),
  );
  if (!match) throw new Error(`Imperial Cinnabar ${theme} theme was not found`);

  return Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

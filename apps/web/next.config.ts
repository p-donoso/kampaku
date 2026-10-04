import type { NextConfig } from "next";
import { resolveAllowedDevOrigins } from "./src/lib/dev-origins";

// The browser's same-origin proxy to Core is `src/app/api/v1/[...path]/route.ts`, **not** a `rewrites` entry.
//
// A rewrite builds its destination into `.next/routes-manifest.json` at build time, so `KAMPAKU_CORE_URL` — which
// `scripts/start.sh` exports before `next start` and `docs/development/local-ports.md` calls a per-run override —
// could not reach a Core on a port the run declared. Measured 2026-10-04 opening suite 08's fourth re-run: the
// build baked `http://127.0.0.1:28080`, the run's Core listened on `28082`, the dashboard rendered from SSR (which
// does read the env at runtime), and every client interaction answered *"The server is unavailable right now."*
// A route handler reads the environment per request, which is what the override needs.
const nextConfig: NextConfig = {
  // Required when opening the dev UI via LAN IP (e.g. http://192.168.x.x:28002).
  // Without this, Next blocks /_next/* chunks and client components never hydrate.
  allowedDevOrigins: resolveAllowedDevOrigins(process.env.KAMPAKU_ALLOWED_DEV_ORIGINS),
};

export default nextConfig;

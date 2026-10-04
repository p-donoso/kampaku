import type { NextRequest } from "next/server";
import { proxyToCore } from "../../../../lib/core-proxy";

/**
 * The web's same-origin proxy to Core, resolved per request.
 *
 * See `src/lib/core-proxy.ts` for why this is a route handler and not the `rewrites` entry it replaced: a
 * rewrite's destination is baked into the build, so a Core on the port a run declared could not be reached.
 *
 * `afterFiles` rewrites run only when no file matches, so this route takes precedence over the old rewrite
 * while both exist.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyToCore(request);
}

export async function POST(request: NextRequest) {
  return proxyToCore(request);
}

export async function PUT(request: NextRequest) {
  return proxyToCore(request);
}

export async function PATCH(request: NextRequest) {
  return proxyToCore(request);
}

export async function DELETE(request: NextRequest) {
  return proxyToCore(request);
}

export async function HEAD(request: NextRequest) {
  return proxyToCore(request);
}

import { NextRequest } from "next/server";

/**
 * Forwards a browser request to Core, resolving Core's address **at request time**.
 *
 * Why this exists, and why it is not the rewrite it replaces. `next.config.ts` proxied the browser's
 * same-origin calls with `rewrites: [{ source: "/api/v1/:path*", destination: `${coreUrl}/api/v1/:path*` }]`,
 * where `coreUrl` came from `KAMPAKU_CORE_URL`. Next bakes the rewrites into
 * `.next/routes-manifest.json` at **build** time, so the destination was frozen into the build: measured
 * 2026-10-04, a build made with no `KAMPAKU_CORE_URL` in its environment produced
 * `"destination": "http://127.0.0.1:28080/api/v1/:path*"`, and a stack started afterwards with
 * `KAMPAKU_CORE_URL=http://127.0.0.1:28082` served a UI whose every browser call went to `28080` — nothing
 * listening — so the dashboard rendered from SSR (which does read the env at runtime) while every client
 * interaction failed with *"The server is unavailable right now."* and the operator could not answer a human
 * gate. `scripts/start.sh` exports `KAMPAKU_CORE_URL` and `NEXT_PUBLIC_KAMPAKU_API_URL` before `next start`
 * and `docs/development/local-ports.md` says a run's own `run.env` wins, so the documented behaviour is
 * runtime resolution; a build-time constant cannot deliver it.
 *
 * A route handler does read `process.env` on every request, so this is the same proxy with the address
 * resolved when it is used rather than when it was compiled.
 */
export function resolveProxyCoreUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.KAMPAKU_CORE_URL ??
    env.NEXT_PUBLIC_KAMPAKU_API_URL ??
    "http://127.0.0.1:28080"
  ).replace(/\/$/, "");
}

/** Headers that describe *this* hop and must not be copied onto the forwarded request. */
const HOP_BY_HOP = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding"]);

export async function proxyToCore(request: NextRequest): Promise<Response> {
  const target = new URL(request.url);
  const url = `${resolveProxyCoreUrl()}${target.pathname}${target.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = !["GET", "HEAD"].includes(request.method);
  // `duplex: "half"` is Node's requirement for a streaming request body; it is not in the DOM typings.
  const init = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
    ...(hasBody ? { body: request.body, duplex: "half" as const } : {}),
  };
  const upstream = await fetch(url, init as RequestInit & { duplex?: "half" });

  // Streamed straight through, so the chat endpoint's SSE frames reach the browser as they arrive rather
  // than after the stream closes.
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

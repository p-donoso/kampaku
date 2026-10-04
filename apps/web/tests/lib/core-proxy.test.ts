import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProxyCoreUrl } from "../../src/lib/core-proxy";

/**
 * The browser's proxy to Core must resolve Core's address **per request**.
 *
 * `next.config.ts` used to rewrite `/api/v1/:path*` to `${KAMPAKU_CORE_URL}/api/v1/:path*`, and Next bakes a
 * rewrite's destination into `.next/routes-manifest.json` at build time. Measured 2026-10-04 opening suite 08's
 * fourth re-run: the build (no `KAMPAKU_CORE_URL` in its environment) produced
 * `"destination": "http://127.0.0.1:28080/api/v1/:path*"`, the run's Core listened on `28082`, the dashboard
 * rendered from SSR — which reads the env at runtime — and every client call failed with *"The server is
 * unavailable right now."*, so a human gate could not be answered through the browser at all.
 *
 * The defect is not "the wrong port": it is an address frozen at compile time standing in for one the
 * documents say is set per run. So the assertion is that a change to the environment is picked up **after** the
 * module has been loaded, which a build-time constant cannot satisfy.
 */
describe("the web's proxy to Core", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the Core address when it is called, not when the module was loaded", () => {
    vi.stubEnv("KAMPAKU_CORE_URL", "http://127.0.0.1:28082");
    expect(resolveProxyCoreUrl()).toBe("http://127.0.0.1:28082");

    // The same process, a run that declared a different port: the second read must move with it.
    vi.stubEnv("KAMPAKU_CORE_URL", "http://127.0.0.1:28099");
    expect(resolveProxyCoreUrl()).toBe("http://127.0.0.1:28099");
  });

  it("falls back to the declared block's port, and tolerates a trailing slash", () => {
    vi.stubEnv("KAMPAKU_CORE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_KAMPAKU_API_URL", "");
    // An empty string is not a value; the documented default is the block's Core port.
    expect(resolveProxyCoreUrl({ NODE_ENV: "test" })).toBe("http://127.0.0.1:28080");
    expect(resolveProxyCoreUrl({ NODE_ENV: "test", KAMPAKU_CORE_URL: "http://127.0.0.1:28082/" })).toBe(
      "http://127.0.0.1:28082",
    );
  });
});

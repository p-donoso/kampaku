import type { NextConfig } from "next";
import { resolveAllowedDevOrigins } from "./src/lib/dev-origins";

// The default is the declared Core port (scripts/ports.env, docs/development/local-ports.md).
const coreUrl =
  process.env.KAMPAKU_CORE_URL ??
  process.env.NEXT_PUBLIC_KAMPAKU_API_URL ??
  "http://127.0.0.1:28080";

const nextConfig: NextConfig = {
  // Required when opening the dev UI via LAN IP (e.g. http://192.168.x.x:28002).
  // Without this, Next blocks /_next/* chunks and client components never hydrate.
  allowedDevOrigins: resolveAllowedDevOrigins(process.env.KAMPAKU_ALLOWED_DEV_ORIGINS),
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${coreUrl.replace(/\/$/, "")}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

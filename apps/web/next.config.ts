import type { NextConfig } from "next";
import { resolveAllowedDevOrigins } from "./src/lib/dev-origins";

const coreUrl =
  process.env.KAMPAKU_CORE_URL ??
  process.env.NEXT_PUBLIC_KAMPAKU_API_URL ??
  "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  // Required when opening the dev UI via LAN IP (e.g. http://192.168.x.x:3002).
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

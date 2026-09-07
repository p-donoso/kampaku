import { describe, expect, it } from "vitest";
import { resolveAllowedDevOrigins } from "@/lib/dev-origins";

describe("resolveAllowedDevOrigins", () => {
  /**
   * LAN dev hosts must be whitelisted or Next.js blocks /_next/* chunks and
   * client components (theme toggle, sidebar collapse) never hydrate.
   */
  it("includes localhost defaults plus env-provided LAN hosts", () => {
    const origins = resolveAllowedDevOrigins("192.168.0.104,192.168.1.50");

    expect(origins).toContain("127.0.0.1");
    expect(origins).toContain("localhost");
    expect(origins).toContain("192.168.0.104");
    expect(origins).toContain("192.168.1.50");
  });

  it("deduplicates repeated origins", () => {
    const origins = resolveAllowedDevOrigins("localhost,192.168.0.104,192.168.0.104");

    expect(origins.filter((o) => o === "192.168.0.104")).toHaveLength(1);
  });
});

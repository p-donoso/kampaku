import { describe, it, expect } from "vitest";
import { resolveAllowedDevOrigins, DEFAULT_DEV_ORIGINS } from "@/lib/dev-origins";

describe("dev-origins", () => {
  describe("DEFAULT_DEV_ORIGINS", () => {
    it("includes localhost and 127.0.0.1", () => {
      expect(DEFAULT_DEV_ORIGINS).toContain("127.0.0.1");
      expect(DEFAULT_DEV_ORIGINS).toContain("localhost");
    });
  });

  describe("resolveAllowedDevOrigins", () => {
    it("returns defaults when no env value provided", () => {
      const origins = resolveAllowedDevOrigins();
      expect(origins).toContain("127.0.0.1");
      expect(origins).toContain("localhost");
    });

    it("returns defaults when empty env value provided", () => {
      const origins = resolveAllowedDevOrigins("");
      expect(origins).toContain("127.0.0.1");
      expect(origins).toContain("localhost");
    });

    it("adds extra origins from env value", () => {
      const origins = resolveAllowedDevOrigins("custom.dev,another.local");
      expect(origins).toContain("127.0.0.1");
      expect(origins).toContain("localhost");
      expect(origins).toContain("custom.dev");
      expect(origins).toContain("another.local");
    });

    it("trims whitespace from extra origins", () => {
      const origins = resolveAllowedDevOrigins(" custom.dev , another.local ");
      expect(origins).toContain("custom.dev");
      expect(origins).toContain("another.local");
    });

    it("filters out empty entries", () => {
      const origins = resolveAllowedDevOrigins("custom.dev,,another.local");
      expect(origins.filter((o) => o === "")).toHaveLength(0);
    });

    it("deduplicates origins", () => {
      const origins = resolveAllowedDevOrigins("localhost,custom.dev,localhost");
      const localhostCount = origins.filter((o) => o === "localhost").length;
      expect(localhostCount).toBe(1);
    });
  });
});

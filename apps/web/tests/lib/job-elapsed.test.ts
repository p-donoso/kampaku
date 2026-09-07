import { describe, it, expect } from "vitest";
import { formatElapsedMs, elapsedMsSince } from "@/lib/job-elapsed";

describe("job elapsed time utilities", () => {
  describe("formatElapsedMs", () => {
    it("formats zero time", () => {
      expect(formatElapsedMs(0)).toBe("0:00");
    });

    it("formats seconds only", () => {
      expect(formatElapsedMs(5000)).toBe("0:05");
      expect(formatElapsedMs(59000)).toBe("0:59");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsedMs(65000)).toBe("1:05");
      expect(formatElapsedMs(125000)).toBe("2:05");
    });

    it("formats large durations", () => {
      expect(formatElapsedMs(3665000)).toBe("61:05");
    });

    it("pads seconds with zero", () => {
      expect(formatElapsedMs(61000)).toBe("1:01");
      expect(formatElapsedMs(3000)).toBe("0:03");
    });
  });

  describe("elapsedMsSince", () => {
    it("calculates elapsed time from ISO string", () => {
      const past = new Date(Date.now() - 5000).toISOString();
      const elapsed = elapsedMsSince(past);
      expect(elapsed).toBeGreaterThanOrEqual(4900);
      expect(elapsed).toBeLessThan(6000);
    });

    it("returns null for undefined input", () => {
      expect(elapsedMsSince(undefined)).toBeNull();
    });

    it("returns null for invalid ISO string", () => {
      expect(elapsedMsSince("not-a-date")).toBeNull();
    });

    it("uses custom now timestamp", () => {
      const past = "2026-01-01T00:00:00.000Z";
      const now = new Date("2026-01-01T00:01:00.000Z").getTime();
      expect(elapsedMsSince(past, now)).toBe(60000);
    });
  });
});

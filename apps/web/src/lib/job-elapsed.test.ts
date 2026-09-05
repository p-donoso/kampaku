import { describe, expect, it } from "vitest";
import { elapsedMsSince, formatElapsedMs } from "./job-elapsed";

describe("job elapsed formatting", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsedMs(125_000)).toBe("2:05");
  });

  it("computes elapsed from ISO timestamp", () => {
    const started = new Date("2026-01-01T00:00:00.000Z").toISOString();
    expect(elapsedMsSince(started, Date.parse("2026-01-01T00:01:05.000Z"))).toBe(65_000);
  });
});

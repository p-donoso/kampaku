import { describe, it, expect } from "vitest";
import { getHealth } from "../../src/application/health.js";

describe("health check", () => {
  it("returns healthy status", () => {
    const result = getHealth();

    expect(result).toEqual({ status: "ok" });
  });
});

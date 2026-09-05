import { describe, expect, it } from "vitest";
import { isUuid } from "../src/cli/execution-target.js";

describe("execution-target", () => {
  it("detects UUID v4 strings", () => {
    expect(isUuid("ed535a61-ecec-413d-9916-29c3b184cf53")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("Add health check endpoint")).toBe(false);
  });
});

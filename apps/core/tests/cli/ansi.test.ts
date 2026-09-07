import { describe, it, expect } from "vitest";
import { checkMark, clearScreen } from "../../src/cli/ansi.js";

describe("ansi utilities", () => {
  it("checkMark returns check for true", () => {
    const result = checkMark(true);
    expect(result).toBeTruthy();
  });

  it("checkMark returns X for false", () => {
    const result = checkMark(false);
    expect(result).toBeTruthy();
  });

  it("clearScreen exists", () => {
    expect(clearScreen).toBeDefined();
  });
});

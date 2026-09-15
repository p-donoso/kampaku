import { describe, expect, it } from "vitest";
import { inspectBrowserPage } from "../src/tools/browser-runtime.js";

describe("browser runtime", () => {
  it("rejects unsafe browser targets", async () => {
    await expect(inspectBrowserPage("http://example.com")).rejects.toThrow("HTTPS");
  });
});

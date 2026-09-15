import { describe, expect, it } from "vitest";
import { assertPublicSourceUrl } from "../src/tools/public-source.js";

describe("public source URL boundary", () => {
  it("accepts official HTTPS documentation and rejects local or redirected targets", () => {
    expect(assertPublicSourceUrl("https://www.jlpt.jp/e/about/index.html").hostname).toBe("www.jlpt.jp");
    expect(() => assertPublicSourceUrl("http://localhost:3001/keys")).toThrow();
    expect(() => assertPublicSourceUrl("https://jlpt.jp.evil.example/page")).toThrow();
    expect(() => assertPublicSourceUrl("https://user:pass@www.jlpt.jp/page")).toThrow();
  });
});

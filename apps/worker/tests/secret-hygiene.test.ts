import { describe, expect, it } from "vitest";
import {
  assertContentHasNoSecrets,
  assertPathNotSensitive,
  looksLikeSecretContent,
} from "../src/tools/secret-hygiene.js";

describe("worker secret hygiene", () => {
  it("blocks secret-like writes and sensitive relative paths", () => {
    expect(looksLikeSecretContent("token=sk_test_abcdefghijklmnopqrstuv")).toBe(true);
    expect(() => assertContentHasNoSecrets("api_key=sk_live_abcdefghijklmnopqrstuv")).toThrow(
      /secret-like/i,
    );
    expect(() => assertPathNotSensitive(".ssh/id_rsa")).toThrow(/sensitive path/i);
    expect(() => assertPathNotSensitive("README.md")).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  describeFreellmapiInferenceError,
  formatKampakuProviderError,
} from "../../src/model-broker/freellmapi-errors.js";

describe("describeFreellmapiInferenceError", () => {
  describe("model exhaustion errors", () => {
    it("returns setup message for 'all models exhausted'", () => {
      const result = describeFreellmapiInferenceError("Error: all models exhausted");
      expect(result).toContain("FreeLLMApi has no working upstream provider keys");
      expect(result).toContain("http://localhost:3001");
      expect(result).toContain("KAMPAKU_AGENT_MODEL");
    });

    it("returns setup message for 'no usable key configured'", () => {
      const result = describeFreellmapiInferenceError("no usable key configured");
      expect(result).toContain("FreeLLMApi has no working upstream provider keys");
    });

    it("returns setup message for 'model lacks tool-calling'", () => {
      const result = describeFreellmapiInferenceError("model lacks tool-calling support");
      expect(result).toContain("FreeLLMApi has no working upstream provider keys");
      expect(result).toContain("model that supports tools");
    });

    it("is case insensitive for model exhaustion", () => {
      const result = describeFreellmapiInferenceError("ALL MODELS EXHAUSTED");
      expect(result).toContain("FreeLLMApi has no working upstream provider keys");
    });
  });

  describe("provider authentication errors", () => {
    it("returns key update message for 'provider_authentication_failed'", () => {
      const result = describeFreellmapiInferenceError("provider_authentication_failed");
      expect(result).toContain("FreeLLMApi upstream provider keys are invalid or expired");
      expect(result).toContain("http://localhost:3001");
      expect(result).toContain("Settings → API Keys");
    });

    it("returns key update message for 'upstream api key' error", () => {
      const result = describeFreellmapiInferenceError("upstream api key is invalid");
      expect(result).toContain("FreeLLMApi upstream provider keys are invalid or expired");
    });

    it("returns key update message for 'provider key' error", () => {
      const result = describeFreellmapiInferenceError("provider key expired");
      expect(result).toContain("FreeLLMApi upstream provider keys are invalid or expired");
    });

    it("is case insensitive for provider auth errors", () => {
      const result = describeFreellmapiInferenceError("PROVIDER_AUTHENTICATION_FAILED");
      expect(result).toContain("FreeLLMApi upstream provider keys are invalid or expired");
    });
  });

  describe("unified API key errors", () => {
    it("returns .env message for '401' with 'api key'", () => {
      const result = describeFreellmapiInferenceError("401 unauthorized: api key invalid");
      expect(result).toContain("Invalid FREELLMAPI_API_KEY");
      expect(result).toContain("http://localhost:3001");
      expect(result).toContain(".env");
      expect(result).toContain("kampaku dev");
    });

    it("requires both '401' and 'api key' to match", () => {
      const result1 = describeFreellmapiInferenceError("401 unauthorized");
      expect(result1).toBe("401 unauthorized");

      const result2 = describeFreellmapiInferenceError("api key is missing");
      expect(result2).toBe("api key is missing");
    });

    it("is case insensitive for unified key error", () => {
      const result = describeFreellmapiInferenceError("401 UNAUTHORIZED: API KEY INVALID");
      expect(result).toContain("Invalid FREELLMAPI_API_KEY");
    });
  });

  describe("unknown errors", () => {
    it("returns detail as-is for unrecognized errors", () => {
      const detail = "Unknown network error occurred";
      const result = describeFreellmapiInferenceError(detail);
      expect(result).toBe(detail);
    });

    it("returns detail for partial matches", () => {
      const detail = "Some models work fine";
      const result = describeFreellmapiInferenceError(detail);
      expect(result).toBe(detail);
    });

    it("handles empty string", () => {
      const result = describeFreellmapiInferenceError("");
      expect(result).toBe("");
    });
  });
});

describe("formatKampakuProviderError", () => {
  it("prefixes recognized errors with standard message", () => {
    const result = formatKampakuProviderError("all models exhausted");
    expect(result).toContain("Failed to contact the AI provider:");
    expect(result).toContain("FreeLLMApi has no working upstream provider keys");
  });

  it("prefixes unrecognized errors with standard message", () => {
    const detail = "Custom error message";
    const result = formatKampakuProviderError(detail);
    expect(result).toBe(`Failed to contact the AI provider: ${detail}`);
  });

  it("handles provider authentication errors", () => {
    const result = formatKampakuProviderError("provider_authentication_failed");
    expect(result).toContain("Failed to contact the AI provider:");
    expect(result).toContain("FreeLLMApi upstream provider keys are invalid or expired");
  });

  it("handles unified API key errors", () => {
    const result = formatKampakuProviderError("401 api key error");
    expect(result).toContain("Failed to contact the AI provider:");
    expect(result).toContain("Invalid FREELLMAPI_API_KEY");
  });
});

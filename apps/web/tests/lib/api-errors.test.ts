import { describe, it, expect } from "vitest";
import {
  toApiError,
  formatUserFacingError,
  isNotFoundError,
  userMessageForStatus,
  ApiError,
} from "@/lib/api-errors";

describe("API error utilities", () => {
  describe("toApiError", () => {
    it("creates error with status code", () => {
      const error = toApiError("/api/test", 404, "");

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(404);
      expect(error.path).toBe("/api/test");
    });

    it("includes parsed JSON error message", () => {
      const body = JSON.stringify({ error: "Custom error message" });
      const error = toApiError("/api/test", 400, body);

      expect(error.message).toBe("Custom error message");
    });

    it("uses user-friendly message for common status codes", () => {
      const error = toApiError("/api/test", 404, "");

      expect(error.message).toContain("not found");
    });
  });

  describe("userMessageForStatus", () => {
    it("returns not found message for 404", () => {
      const message = userMessageForStatus(404);

      expect(message).toContain("not found");
    });

    it("returns permission message for 403", () => {
      const message = userMessageForStatus(403);

      expect(message).toContain("permission");
    });

    it("returns conflict message for 409", () => {
      const message = userMessageForStatus(409);

      expect(message).toContain("conflict");
    });

    it("returns server error message for 500+", () => {
      const message = userMessageForStatus(500);

      expect(message).toContain("server");
    });

    it("includes entity context when provided", () => {
      const message = userMessageForStatus(404, { entityType: "agent", action: "load" });

      expect(message).toContain("agent");
    });
  });

  describe("formatUserFacingError", () => {
    it("formats ApiError instances", () => {
      const error = new ApiError("Not found", 404, "/api/test");

      const message = formatUserFacingError(error);

      expect(message).toBeTruthy();
    });

    it("formats generic Error instances", () => {
      const error = new Error("Something went wrong");

      const message = formatUserFacingError(error);

      expect(message).toBe("Something went wrong");
    });

    it("handles unknown error types", () => {
      const message = formatUserFacingError({ unknown: "error" });

      expect(message).toBeTruthy();
    });
  });

  describe("isNotFoundError", () => {
    it("returns true for 404 errors", () => {
      const error = new ApiError("Not found", 404, "/api/test");

      expect(isNotFoundError(error)).toBe(true);
    });

    it("returns false for other status codes", () => {
      const error = new ApiError("Forbidden", 403, "/api/test");

      expect(isNotFoundError(error)).toBe(false);
    });

    it("returns false for non-ApiError", () => {
      const error = new Error("Generic error");

      expect(isNotFoundError(error)).toBe(false);
    });
  });
});

import { describe, it, expect } from "vitest";
import { CoreClientError } from "../../src/client/base-client.js";

describe("base-client", () => {
  describe("CoreClientError", () => {
    it("creates error with message and status", () => {
      const error = new CoreClientError("Not found", 404);
      expect(error.message).toBe("Not found");
      expect(error.status).toBe(404);
      expect(error.name).toBe("CoreClientError");
    });

    it("includes body when provided", () => {
      const error = new CoreClientError("Bad request", 400, '{"error":"Invalid"}');
      expect(error.message).toBe("Bad request");
      expect(error.status).toBe(400);
      expect(error.body).toBe('{"error":"Invalid"}');
    });

    it("works without body", () => {
      const error = new CoreClientError("Internal error", 500);
      expect(error.message).toBe("Internal error");
      expect(error.status).toBe(500);
      expect(error.body).toBeUndefined();
    });

    it("is instanceof Error", () => {
      const error = new CoreClientError("Test", 500);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CoreClientError);
    });
  });
});

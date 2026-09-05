import { describe, expect, it } from "vitest";
import { ApiError, formatUserFacingError, isNotFoundError, toApiError, userMessageForStatus } from "./api-errors";

describe("api-errors", () => {
  it("maps 404 load errors to friendly copy", () => {
    expect(userMessageForStatus(404, { entityType: "agent", action: "load" })).toBe(
      "Este agente ya no existe o fue eliminado.",
    );
    expect(userMessageForStatus(404, { entityType: "project", action: "load" })).toBe(
      "Este proyecto ya no existe o fue eliminado.",
    );
  });

  it("prefers server error messages when present", () => {
    const error = toApiError("/api/v1/agents/foo", 403, JSON.stringify({ error: "Built-in agents cannot be deleted." }), {
      entityType: "agent",
      action: "delete",
    });
    expect(error.message).toBe("Built-in agents cannot be deleted.");
  });

  it("detects not found errors", () => {
    const error = new ApiError("missing", 404, "/api/v1/agents/foo");
    expect(isNotFoundError(error)).toBe(true);
    expect(isNotFoundError(new ApiError("nope", 500, "/x"))).toBe(false);
  });

  it("formats legacy fetch errors without exposing raw paths", () => {
    expect(
      formatUserFacingError(new Error("/api/v1/agents/web-lead: 404 Not Found"), {
        entityType: "agent",
        action: "load",
      }),
    ).toBe("Este agente ya no existe o fue eliminado.");
  });
});

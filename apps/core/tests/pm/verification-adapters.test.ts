import { describe, expect, it } from "vitest";
import { createVerificationRequest, createVerificationResult } from "../../src/application/pm/verification-adapters.js";

describe("verification adapters", () => {
  it("creates artifact and endpoint requests with bounded execution metadata", () => {
    const artifact = createVerificationRequest("inspect_artifact", "ac-1", "docs/report.pdf", 5000);
    const endpoint = createVerificationRequest("request_endpoint", "ac-2", "/health");
    expect(artifact.timeoutMs).toBe(5000);
    expect(endpoint.capability).toBe("request_endpoint");
    expect(createVerificationResult(artifact, true, "docs/report.pdf").reference).toBe("docs/report.pdf");
  });
});

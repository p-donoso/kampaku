import { describe, expect, it } from "vitest";
import { appendAttempt, createTraceLink, hasVersionedOutput } from "../../src/application/pm/traceability.js";

describe("traceability", () => {
  it("links requirements through work, artifacts, and evidence", () => {
    const link = createTraceLink({ requirementId: "req-1", workItemId: "wi-1", attemptId: "attempt-1", artifactRefs: ["src/result.ts"], evidenceRefs: ["check:build"], versionRef: "commit:abc" });
    expect(hasVersionedOutput(link)).toBe(true);
  });

  it("preserves immutable attempt history", () => {
    const attempt = { id: "attempt-1", workItemId: "wi-1", status: "failed", outputHash: "sha256:x", recordedAt: new Date().toISOString() };
    expect(appendAttempt([], attempt)).toHaveLength(1);
    expect(() => appendAttempt([attempt], attempt)).toThrow("unique");
  });
});

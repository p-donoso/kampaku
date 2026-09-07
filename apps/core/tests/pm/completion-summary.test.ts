import { describe, expect, it } from "vitest";
import { buildCompletionMessages } from "../../src/application/pm/completion-summary.js";

describe("buildCompletionMessages", () => {
  it("builds structured journal with summary, checks, and machine-readable block", () => {
    const result = {
      jobId: "job-1",
      leaseId: "lease-1",
      status: "succeeded" as const,
      finishedAt: "2026-08-30T05:00:00.000Z",
      output: {
        summary: "Added health endpoint at app/api/health/route.ts.",
        repositoryPath: "/home/pdonoso/projects/learn-japanese",
        checkResults: { test: true, build: true },
        filesChanged: ["app/api/health/route.ts"],
        iterations: 12,
      },
    };

    const messages = buildCompletionMessages(
      {
        title: "Implement health endpoint",
        acceptanceCriteria: ["npm test passes", "app/api/health/route.ts exists"],
      },
      result,
    );

    expect(messages.agentBody).toContain("Implement health endpoint");
    expect(messages.journalBody).toContain("Status: succeeded");
    expect(messages.journalBody).toContain("## Summary");
    expect(messages.journalBody).toContain("health endpoint");
    expect(messages.journalBody).toContain("## Files changed");
    expect(messages.journalBody).toContain("app/api/health/route.ts");
    expect(messages.journalBody).toContain("## Checks");
    expect(messages.journalBody).toContain("test: pass");
    expect(messages.journalBody).toContain("completion-json");
    expect(messages.journalBody).toContain('"iterations": 12');
  });
});

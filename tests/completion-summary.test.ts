import { describe, expect, it } from "vitest";
import { buildCompletionMessages } from "../src/application/pm/completion-summary.js";

describe("buildCompletionMessages", () => {
  it("keeps agent log short while journal records durable context", () => {
    const result = {
      jobId: "job-1",
      leaseId: "lease-1",
      status: "succeeded" as const,
      finishedAt: "2026-08-30T05:00:00.000Z",
      output: {
        summary:
          "Added health endpoint. Also updated docs and fixed unrelated issues in the summary that should not appear fully.",
        repositoryPath: "/home/pdonoso/projects/learn-japanese",
      },
    };

    const messages = buildCompletionMessages({ title: "Implement health endpoint" }, result);

    expect(messages.agentBody).toBe('Completed "Implement health endpoint".');
    expect(messages.agentSummary).toBe(messages.agentBody);
    expect(messages.journalBody).toContain("Status: succeeded");
    expect(messages.journalBody).toContain("Job: job-1");
    expect(messages.journalBody).toContain("Repository: /home/pdonoso/projects/learn-japanese");
    expect(messages.journalBody).toContain("Added health endpoint.");
    expect(messages.journalBody).not.toContain("unrelated issues");
  });
});

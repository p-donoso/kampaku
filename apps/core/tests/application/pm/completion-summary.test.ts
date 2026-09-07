import { describe, it, expect } from "vitest";
import { buildCompletionMessages } from "../../../src/application/pm/completion-summary.js";
import type { JobResultRecord } from "../../../src/persistence/store.js";

describe("completion-summary", () => {
  const mockResult = (overrides: Partial<JobResultRecord> = {}): JobResultRecord => ({
    id: "result-1",
    jobId: "job-1",
    status: "succeeded",
    finishedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  });

  describe("buildCompletionMessages", () => {
    it("builds messages for succeeded status", () => {
      const workItem = { title: "Implement feature", acceptanceCriteria: ["Works correctly"] };
      const result = mockResult({
        status: "succeeded",
        output: { summary: "Feature implemented successfully" },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.agentBody).toContain("Completed");
      expect(messages.agentBody).toContain("Feature implemented successfully");
      expect(messages.journalBody).toContain("Status: succeeded");
      expect(messages.journalBody).toContain("Job: job-1");
    });

    it("builds messages for failed status", () => {
      const workItem = { title: "Implement feature" };
      const result = mockResult({
        status: "failed",
        output: { summary: "Could not complete task" },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.agentBody).toContain("failed");
      expect(messages.journalBody).toContain("Status: failed");
    });

    it("includes files changed in journal", () => {
      const workItem = { title: "Fix bug" };
      const result = mockResult({
        output: { filesChanged: ["src/app.ts", "src/utils.ts"] },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("## Files changed");
      expect(messages.journalBody).toContain("src/app.ts");
      expect(messages.journalBody).toContain("src/utils.ts");
    });

    it("includes check results in journal", () => {
      const workItem = { title: "Run tests" };
      const result = mockResult({
        output: { checkResults: { "npm test": true, "npm run lint": false } },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("## Checks");
      expect(messages.journalBody).toContain("npm test: pass");
      expect(messages.journalBody).toContain("npm run lint: fail/missing");
    });

    it("includes acceptance criteria in journal", () => {
      const workItem = { title: "Feature", acceptanceCriteria: ["Criterion A", "Criterion B"] };
      const result = mockResult({});

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("## Acceptance criteria");
      expect(messages.journalBody).toContain("Criterion A");
      expect(messages.journalBody).toContain("Criterion B");
    });

    it("includes follow-ups in journal", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { followUps: "Next step: add tests" },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("## Follow-ups");
      expect(messages.journalBody).toContain("Next step: add tests");
    });

    it("includes repository info in journal", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { repositoryPath: "/path/to/repo" },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("Repository: /path/to/repo");
    });

    it("includes iteration count in journal", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { iterations: 5 },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("Iterations: 5");
    });

    it("truncates long agent body", () => {
      const workItem = { title: "Feature" };
      const longSummary = "A".repeat(1000);
      const result = mockResult({
        output: { summary: longSummary },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.agentBody.length).toBeLessThanOrEqual(512);
      expect(messages.agentSummary.length).toBeLessThanOrEqual(512);
    });

    it("truncates long journal body", () => {
      const workItem = { title: "Feature", acceptanceCriteria: Array(200).fill("Criterion") };
      const result = mockResult({});

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody.length).toBeLessThanOrEqual(4096);
    });

    it("handles files_changed snake_case variant", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { files_changed: ["file1.ts", "file2.ts"] },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("file1.ts");
    });

    it("filters out non-string entries in filesChanged", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { filesChanged: ["file1.ts", null, undefined, 123, "file2.ts", ""] },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("file1.ts");
      expect(messages.journalBody).toContain("file2.ts");
      expect(messages.journalBody).not.toContain("123");
    });

    it("includes machine-readable JSON block", () => {
      const workItem = { title: "Feature" };
      const result = mockResult({
        output: { iterations: 3 },
      });

      const messages = buildCompletionMessages(workItem, result);

      expect(messages.journalBody).toContain("<!-- completion-json");
      expect(messages.journalBody).toContain('"jobId": "job-1"');
      expect(messages.journalBody).toContain('"status": "succeeded"');
    });
  });
});

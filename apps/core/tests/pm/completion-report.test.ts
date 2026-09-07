import { describe, expect, it } from "vitest";
import { validateCompletionReport } from "../../src/agents/runtime/tools/journal-tools.js";

const validDetails = [
  "Decisions: kept the existing API shape.",
  "Files: /workspace/src/health.ts.",
  "Check results: npm test passed.",
  "AC verification: all acceptance criteria passed.",
  "Follow-ups: none.",
].join("\n");

describe("completion report contract", () => {
  it("accepts a structured evidence report", () => {
    expect(() => validateCompletionReport({
      agent_slug: "demo-backend",
      work_item_id: "item-1",
      summary: "Implemented and verified the health endpoint.",
      details: validDetails,
    })).not.toThrow();
  });

  it("rejects a short or unstructured report", () => {
    expect(() => validateCompletionReport({
      agent_slug: "demo-backend",
      work_item_id: "item-1",
      summary: "Done.",
      details: "Everything is complete.",
    })).toThrow(/summary must be at least 20/);

    expect(() => validateCompletionReport({
      agent_slug: "demo-backend",
      work_item_id: "item-1",
      summary: "Implemented and verified the health endpoint.",
      details: "The change was made and appears to work.",
    })).toThrow(/missing sections|details must include/);
  });
});

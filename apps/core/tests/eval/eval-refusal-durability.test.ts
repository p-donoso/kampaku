import { describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { executeTriageIntent, REFUSAL_BOUNDARIES } from "../../src/agents/runtime/tools/triage-intent.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A refusal is a product behavior, so it is verified like one.
 *
 * Before this, the boundary existed only in prose: the front office said "that is out of scope" in a
 * reply and forgot it. Nothing recorded that a request was declined, which boundary it crossed, or how
 * often it happens — the [BOARD F-007](../../../../docs/eval/results/BOARD.md) shape, a behavior with no
 * durable sink.
 */

function withStore<T>(run: (store: RefusalStore) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "kampaku-refusal-"));
  try {
    const { db } = createDb(join(directory, "test.db"));
    return run(new RefusalStore(db));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("out-of-scope refusal is a durable decision", () => {
  it("records a refusal with the boundary that was crossed", () => {
    withStore((store) => {
      const recorded = store.record({
        request: "Write me a 400-page historical novel about the project.",
        boundary: "creative_writing",
        surface: "chat",
      });

      expect(recorded.id).toBeTruthy();
      expect(recorded.boundary).toBe("creative_writing");
      // The statement must name the boundary, not apologise generically.
      expect(recorded.boundaryStatement).toMatch(/software is the deliverable/i);
      expect(recorded.boundaryStatement).toMatch(/creative writing/i);

      // And it survives: the point of the record is that it outlives the reply.
      expect(store.get(recorded.id)).toMatchObject({ boundary: "creative_writing" });
      expect(store.count()).toBe(1);
    });
  });

  it("rejects a refusal that does not name its boundary", () => {
    withStore((store) => {
      expect(() =>
        store.record({
          request: "Something vague",
          boundary: "not_a_boundary" as never,
          surface: "chat",
        }),
      ).toThrow(/Unknown boundary/);

      // A refusal with no request is equally unusable: it cannot be re-examined.
      expect(() =>
        store.record({ request: "   ", boundary: "creative_writing", surface: "chat" }),
      ).toThrow(/request is required/i);
    });
  });

  it("states each boundary in canonical wording, so every surface agrees", () => {
    for (const boundary of REFUSAL_BOUNDARIES) {
      const statement = RefusalStore.boundaryStatement(boundary);
      expect(statement, `${boundary} must state the deliverable boundary`).toMatch(
        /software is the deliverable/i,
      );
      expect(statement.length).toBeGreaterThan(60);
    }
  });

  it("distinguishes the boundaries, so a refusal says which one it crossed", () => {
    const statements = REFUSAL_BOUNDARIES.map((boundary) => RefusalStore.boundaryStatement(boundary));
    expect(new Set(statements).size).toBe(REFUSAL_BOUNDARIES.length);
  });

  it("keeps the record readable after later refusals, newest first", () => {
    withStore((store) => {
      store.record({ request: "first request here", boundary: "non_technical_document", surface: "cli" });
      store.record({ request: "second request here", boundary: "standalone_design", surface: "agent" });

      const listed = store.list();
      expect(listed).toHaveLength(2);
      expect(listed[0].boundary).toBe("standalone_design");
    });
  });
});

describe("triage classifies out-of-scope work instead of routing it", () => {
  it("refuses planning for an out_of_scope classification", () => {
    const result = executeTriageIntent({
      intent: "Write a market-research report on the industry.",
      category: "out_of_scope",
      boundary: "non_technical_research",
    });

    expect(result.planningAllowed).toBe(false);
    expect(result.refusal).toMatchObject({ boundary: "non_technical_research" });
    expect(result.message).toMatch(/not routed into planning/i);
  });

  it("refuses an out_of_scope classification that names no boundary", () => {
    // The generic apology is the failure mode: a refusal that says nothing about why is
    // indistinguishable from a capability limitation, which is what eval 04 scores against.
    expect(() =>
      executeTriageIntent({ intent: "Write a novel about the platform.", category: "out_of_scope" }),
    ).toThrow(/must name the boundary/i);
  });

  it("still allows planning for in-scope technical work", () => {
    const result = executeTriageIntent({
      intent: "Fix the failing build in the linked repository.",
      category: "maintenance",
    });

    expect(result.planningAllowed).toBe(true);
    expect(result.refusal).toBeUndefined();
  });
});

describe("the tool path records the refusal, not only the reply", () => {
  // The timeout is raised deliberately. This test `await import()`s the whole tool graph inside its
  // body, so under load it crosses vitest's 5 s default and the suite goes red for an environment
  // artifact (BOARD F-020, third case). A red suite that means "the host was busy" teaches the
  // operator to ignore red, which is the defect the row describes.
  it("records through executeToolCall and exposes it on the list surface", { timeout: 30_000 }, async () => {
    // The oracle is checked by calling the tool, not by reading a returned object: "the handler would
    // record it" is a claim, and the same claim shape (an instruction that names a tool the runtime
    // cannot reach) is what BOARD F-001 was.
    const { createTestContext } = await import("../helpers/test-context.js");
    const context = createTestContext("kampaku-refusal-tool-");
    try {
      const { executeToolCall } = await import("../../src/agents/runtime/tools/index.js");

      await executeToolCall(
        context.toolContext,
        "triage_intent",
        JSON.stringify({
          intent: "Write me a 400-page historical novel about the platform.",
          category: "out_of_scope",
          boundary: "creative_writing",
        }),
        { agentId: context.agentStore.getKampakuAgent().id },
      );

      const recorded = context.refusalStore.list();
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        boundary: "creative_writing",
        surface: "agent",
        refusedByAgentId: context.agentStore.getKampakuAgent().id,
      });
      expect(recorded[0].boundaryStatement).toMatch(/software is the deliverable/i);
    } finally {
      context.cleanup();
    }
  });

  it("refuses through the tool path when no boundary is named", async () => {
    const { createTestContext } = await import("../helpers/test-context.js");
    const context = createTestContext("kampaku-refusal-tool-noboundary-");
    try {
      const { executeToolCall } = await import("../../src/agents/runtime/tools/index.js");

      const failed = await executeToolCall(
        context.toolContext,
        "triage_intent",
        JSON.stringify({ intent: "Write a novel about the platform.", category: "out_of_scope" }),
        { agentId: context.agentStore.getKampakuAgent().id },
      ).catch((error: unknown) => String((error as Error).message));

      expect(String(failed)).toContain("must name the boundary");
      // And nothing vague was recorded in its place.
      expect(context.refusalStore.count()).toBe(0);
    } finally {
      context.cleanup();
    }
  });
});

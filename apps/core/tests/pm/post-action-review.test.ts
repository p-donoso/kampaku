import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import {
  buildDeterministicReview,
  buildPostActionReviewPrompt,
  evaluatePostActionClosure,
  parseReviewJson,
  retryPostActionProjection,
  runPostActionReview,
  runPostActionReviewSync,
  validatePostActionReview,
  type PostActionReviewInput,
} from "../../src/application/pm/post-action/index.js";

function baseInput(overrides: Partial<PostActionReviewInput> = {}): PostActionReviewInput {
  return {
    event: "work_completed",
    agentSlug: "kampaku-documenter",
    projectId: "project-1",
    workItemId: "item-1",
    referenceId: "job-1",
    summary: "Completed the documentation slice and recorded the verification command output.",
    files: ["README.md"],
    checks: ["npm test: pass"],
    acceptanceCriteria: ["README documents the start command"],
    followUps: ["Add a screenshot to the README."],
    ...overrides,
  };
}

const validReview = {
  journal: {
    summary: "Completed the documentation slice and recorded the verification output for the release notes.",
    decisions: ["Kept the existing file layout."],
    files: ["README.md"],
    checks: ["npm test: pass"],
    acceptanceCriteria: ["README documents the start command"],
    followUps: ["Add a screenshot to the README."],
  },
  memory: { notNeeded: true, reason: "The journal projection already carries the operational outcome." },
  wiki: { decision: "not_needed", reason: "Shared knowledge did not change for this documentation slice." },
};

describe("post-action review protocol", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    context?.cleanup();
    context = undefined;
  });

  /**
   * Seeds a project with one root work item so journal projections have a real
   * anchor instead of relying on missing fixtures.
   */
  function freshContext() {
    const ctx = createTestContext("kampaku-post-action-");
    context = ctx;
    const project = createProject(ctx.store, { slug: "project-1", name: "Project One", status: "active" });
    const now = new Date().toISOString();
    ctx.pmStore.createWorkItem({
      id: "item-1",
      projectId: project.id,
      title: "Document the start command",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["README documents the start command"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return ctx;
  }

  describe("result validation", () => {
    it("accepts a complete projection result", () => {
      const result = validatePostActionReview(validReview, baseInput());
      expect(result.journal.files).toEqual(["README.md"]);
      expect(result.memory.notNeeded).toBe(true);
      expect(result.wiki.decision).toBe("not_needed");
    });

    it("requires journal evidence even when other channels are not needed", () => {
      const { journal, ...withoutJournal } = validReview;
      expect(() => validatePostActionReview(withoutJournal, baseInput())).toThrow(/journal/i);
    });

    it("rejects a lesson that is not marked as needed or not needed", () => {
      expect(() =>
        validatePostActionReview({ ...validReview, memory: {} }, baseInput()),
      ).toThrow(/memory/i);
    });

    it("requires a reason when a channel is not needed", () => {
      expect(() =>
        validatePostActionReview(
          { ...validReview, memory: { notNeeded: true, reason: "no" } },
          baseInput(),
        ),
      ).toThrow(/memory\.reason/);
    });

    it("requires evidence and an existing page for a wiki proposal", () => {
      const input = baseInput({ wikiPages: [{ slug: "dev-setup", title: "Development setup", status: "published" }] });
      expect(() =>
        validatePostActionReview(
          {
            ...validReview,
            wiki: { decision: "propose_edit", reason: "Setup steps changed.", page: "dev-setup" },
          },
          input,
        ),
      ).toThrow(/wiki\.evidence/);

      expect(() =>
        validatePostActionReview(
          {
            ...validReview,
            wiki: { decision: "propose_edit", reason: "Setup steps changed.", page: "missing", evidence: "npm test now requires Node 22." },
          },
          input,
        ),
      ).toThrow(/not found/);
    });

    it("accepts a wiki proposal with an existing page and Markdown evidence", () => {
      const input = baseInput({ wikiPages: [{ slug: "dev-setup", title: "Development setup", status: "published" }] });
      const result = validatePostActionReview(
        {
          ...validReview,
          wiki: {
            decision: "propose_edit",
            reason: "The documented Node version is now wrong.",
            page: "[[dev-setup]]",
            evidence: "apps/core/package.json requires Node 22.",
            contentMd: "## Development setup\n\nInstall Node 22 or newer, then run npm install and npm test from the repository root.",
          },
        },
        input,
      );
      expect(result.wiki.page).toBe("dev-setup");
    });

    it("rejects non-English projection text", () => {
      expect(() =>
        validatePostActionReview(
          { ...validReview, journal: { ...validReview.journal, summary: "Se completó la tarea de documentación y se registró la salida." } },
          baseInput(),
        ),
      ).toThrow(/English/);
    });

    it("rejects secrets and raw transcripts", () => {
      expect(() =>
        validatePostActionReview(
          {
            ...validReview,
            memory: {
              notNeeded: false,
              lesson: {
                title: "Reuse the deployment token",
                body: "The command output contained api_key: sk-abcdefghijklmnopqrstuvwx and should be reused on the next attempt.",
              },
            },
          },
          baseInput(),
        ),
      ).toThrow(/secret/i);

      expect(() =>
        validatePostActionReview(
          {
            ...validReview,
            journal: {
              ...validReview.journal,
              summary: "user: run the checks\nassistant: running the checks now for the release candidate",
            },
          },
          baseInput(),
        ),
      ).toThrow(/transcript/i);
    });
  });

  describe("low-context review call", () => {
    it("derives projections from recorded facts without a model", () => {
      const review = buildDeterministicReview(baseInput());
      expect(review.wiki.decision).toBe("not_needed");
      expect(review.journal.summary).toMatch(/work completed/);
      expect(review.journal.checks).toEqual(["npm test: pass"]);
    });

    it("keeps the lesson channel empty when no failure was recorded", () => {
      const review = buildDeterministicReview(baseInput());
      expect(review.memory.notNeeded).toBe(true);
    });

    it("derives a reusable lesson from failing checks", () => {
      const review = buildDeterministicReview(
        baseInput({ event: "work_failed", checks: ["npm test: fail", "npm run build: pass"] }),
      );
      expect(review.memory.notNeeded).toBe(false);
      expect(review.memory.lesson?.body).toMatch(/npm test/);
    });

    it("parses a fenced JSON reply", () => {
      expect(parseReviewJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    });

    it("carries only recorded facts into the prompt", () => {
      const prompt = buildPostActionReviewPrompt(baseInput());
      expect(prompt).toMatch(/Completed the documentation slice/);
      expect(prompt).not.toMatch(/conversation transcript/i);
      expect(prompt).toMatch(/proposal is not a publication/i);
    });
  });

  describe("projection persistence", () => {
    it("applies journal, memory, and wiki as separate mutations", () => {
      const ctx = freshContext();
      const review = runPostActionReviewSync(ctx.postActionRuntime, {
        ...baseInput({ agentSlug: "kampaku" }),
      });

      const statuses = Object.fromEntries(
        review.projections.map((projection) => [projection.name, projection.status]),
      );
      expect(statuses.journal).toBe("applied");
      expect(statuses.wiki).toBe("skipped");
      expect(review.projections.find((projection) => projection.name === "memory")?.notNeededReason).toBeDefined();
    });

    it("is idempotent for a replayed event", () => {
      const ctx = freshContext();
      const input = { ...baseInput({ agentSlug: "kampaku" }) };
      const first = runPostActionReviewSync(ctx.postActionRuntime, input);
      const second = runPostActionReviewSync(ctx.postActionRuntime, input);
      expect(second.id).toBe(first.id);
      expect(ctx.postActionStore.listProjectionJournalEntries(first.id)).toHaveLength(1);
    });

    it("records the journal projection under the post_action kind with the review reference", () => {
      const ctx = freshContext();
      const review = runPostActionReviewSync(ctx.postActionRuntime, {
        ...baseInput({ agentSlug: "kampaku" }),
      });
      const entries = ctx.journalStore.listByProject("project-1");
      const entry = entries.find((candidate) => candidate.refId === review.id);
      expect(entry?.kind).toBe("post_action");
      expect(entry?.refType).toBe("post_action_review");
      expect(entry?.body).toMatch(/## Checks/);
    });

    it("never publishes wikis: a proposal stays pending", () => {
      const ctx = freshContext();
      const review = runPostActionReviewSync(ctx.postActionRuntime, {
        ...baseInput({ agentSlug: "kampaku" }),
      });
      const wikiOutcome = review.projections.find((projection) => projection.name === "wiki");
      expect(wikiOutcome?.pendingApproval).toBeUndefined();
      expect(wikiOutcome?.status).toBe("skipped");
    });

    it("reports a failed projection without losing the applied ones", () => {
      const ctx = freshContext();
      const brokenRuntime = { ...ctx.postActionRuntime, journalStore: undefined };
      expect(() =>
        runPostActionReviewSync(brokenRuntime, { ...baseInput({ agentSlug: "kampaku" }) }),
      ).not.toThrow();

      const review = runPostActionReviewSync(brokenRuntime, {
        ...baseInput({ agentSlug: "kampaku", referenceId: "job-2" }),
      });
      const journal = review.projections.find((projection) => projection.name === "journal");
      expect(journal?.status).toBe("failed");
      expect(journal?.attempts).toBeGreaterThanOrEqual(1);
      expect(review.status).not.toBe("completed");
    });

    it("retries one projection without re-running the completed work", () => {
      const ctx = freshContext();
      const brokenRuntime = { ...ctx.postActionRuntime, journalStore: undefined };
      const review = runPostActionReviewSync(brokenRuntime, { ...baseInput({ agentSlug: "kampaku" }) });
      expect(review.projections.find((projection) => projection.name === "journal")?.status).toBe("failed");

      const repaired = retryPostActionProjection(
        { ...ctx.postActionRuntime },
        review.id,
        "journal",
      );
      expect(repaired.projections.find((projection) => projection.name === "journal")?.status).toBe("applied");
      expect(repaired.status).toBe("completed");
    });

    it("runs the model path when a delegate is provided", async () => {
      const ctx = freshContext();
      const seen: string[] = [];
      const review = await runPostActionReview(
        ctx.postActionRuntime,
        baseInput({ agentSlug: "kampaku" }),
        {
          delegate: {
            run: async (input) => {
              seen.push(input.event);
              return validReview;
            },
          },
        },
      );
      expect(seen).toEqual(["work_completed"]);
      expect(review.source).toBe("model");
    });
  });

  describe("closure gating", () => {
    it("reports each channel separately and names what is missing", () => {
      const ctx = freshContext();
      const report = evaluatePostActionClosure(ctx.postActionRuntime, {
        projectId: "project-1",
        agentSlug: "kampaku",
        wikiSyncRequired: true,
      });
      expect(report.missing).toContain("post_action_review");

      const review = runPostActionReviewSync(ctx.postActionRuntime, {
        ...baseInput({ agentSlug: "kampaku" }),
      });
      const after = evaluatePostActionClosure(ctx.postActionRuntime, {
        projectId: "project-1",
        agentSlug: "kampaku",
        wikiSyncRequired: true,
      });
      expect(after.journalPresent).toBe(true);
      expect(after.wikiState).toBe("not_needed");
      expect(after.wikiBlocking).toBe(true);
      expect(review.status).toBe("completed");
    });

    it("does not block closure on wiki when synchronization is not required", () => {
      const ctx = freshContext();
      runPostActionReviewSync(ctx.postActionRuntime, { ...baseInput({ agentSlug: "kampaku" }) });
      const report = evaluatePostActionClosure(ctx.postActionRuntime, {
        projectId: "project-1",
        agentSlug: "kampaku",
        wikiSyncRequired: false,
      });
      expect(report.wikiBlocking).toBe(false);
      expect(report.missing).not.toContain("wiki_projection");
    });
  });
});

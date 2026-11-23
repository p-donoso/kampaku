import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { bansWriting, requiresCleanCheckout } from "../../src/application/pm/deliverable-requirements.js";
import { evaluateCriterionEvidenceGate } from "../../src/application/pm/done-honesty.js";
import { createTestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * **"Every other file was left untouched" is the blast radius of a repair, not a ban on writing.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r32`, leaf `b5efd0ab` (*"Fix defect 2: return 0 for an empty ledger in
 * src/ledger/totals.py total"*). Its `ac-4` reads *"The completion report states that every other file in the
 * checkout was left untouched by this leaf, evidenced by a post-change root listing matching the baseline listing"*
 * — the shape a single-file repair uses to promise it changed nothing else. `requiresCleanCheckout` matched the
 * words *checkout … left untouched* and the leaf was dispatched **read-only**, so the repair it was dispatched for
 * could not happen at all:
 *
 * > I confirmed the defect but could not repair it: this job is read-only ("do not write, replace or create any file
 * > in the checkout"), and the only file permitted for the fix is `src/ledger/totals.py`.
 *
 * The job reported `succeeded` with `filesChanged: []`, the runner stayed red, and the leaf blocked — one question
 * about a diff that could never exist.
 *
 * The word that decides it is **other**. "This leaf changes no file" bans writing; "no other file changed" states
 * the blast radius of a leaf that does.
 */
describe("a clean-tree claim scoped to other files (F-169)", () => {
  const tempDirs: string[] = [];
  afterEach(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("does not make a single-file repair read-only", () => {
    const criterion =
      "The completion report states that every other file in the checkout was left untouched by this leaf, "
      + "evidenced by a post-change root listing matching the baseline listing.";
    expect(requiresCleanCheckout(criterion)).toBe(false);

    // A whole-tree demand, with no scoping word, still makes the leaf read-only. That is the rule the scoped
    // reading must not weaken.
    expect(requiresCleanCheckout("The checkout must remain untouched.")).toBe(true);
    expect(requiresCleanCheckout("The checkout is left byte-identical.")).toBe(true);
    expect(requiresCleanCheckout("`git status --porcelain` reported at the end of this leaf is empty.")).toBe(true);
    // Both in one leaf: the scoped clause is dropped and the whole-tree demand still fires.
    expect(
      requiresCleanCheckout(
        "No other file is modified; the checkout must remain byte-identical to the baseline.",
      ),
    ).toBe(true);
    expect(bansWriting("The only file you may write is src/ledger/totals.py.")).toBe(false);
  });

  it("dispatches the repair it was asked for, and closes on its own diff", () => {
    const ctx = createTestContext("kampaku-other-files-");
    const dir = mkdtempSync(join(tmpdir(), "kampaku-other-files-checkout-"));
    tempDirs.push(dir);
    const project = createProject(ctx.store, { slug: "legacy-ledger", name: "legacy-ledger", status: "active" });
    const lead = ctx.agentStore.createSubAgent({
      slug: "legacy-ledger-lead",
      name: "legacy-ledger lead",
      parentId: ctx.agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Own the repair",
      systemPrompt: "Own the repair",
    });
    const now = new Date().toISOString();
    const criteria = [
      "The completion report shows a diff of src/ledger/totals.py in which the only added logic is the "
        + "empty-ledger return of 0.",
      "The completion report states that every other file in the checkout was left untouched by this leaf, "
        + "evidenced by a post-change root listing matching the baseline listing.",
    ];
    ctx.pmStore.createWorkItem({
      id: "item-1",
      projectId: project.id,
      title: "Fix defect 2: return 0 for an empty ledger in src/ledger/totals.py total",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: lead.id,
      acceptanceCriteria: criteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    const workItem = ctx.pmStore.getWorkItem("item-1") as WorkItemRecord;

    // What a writable repair job hands in: the file it wrote, and the check it ran.
    const gate = evaluateCriterionEvidenceGate(
      workItem,
      {
        filesChanged: ["src/ledger/totals.py"],
        evidence: [
          {
            subjectType: "artifact",
            format: "code",
            verificationMethod: "file-inspection",
            subject: "src/ledger/totals.py",
            passed: true,
            verified: true,
            reference: "src/ledger/totals.py",
            observedAt: new Date().toISOString(),
            sourceTool: "verify_file",
            diagnostics: { path: "src/ledger/totals.py", present: true },
          },
        ],
      },
      { journalStore: ctx.journalStore, checkoutPath: dir, requiredChecks: [] },
    );
    // The two criteria are about the report's text, so they stay gates — but the leaf is no longer read-only, which
    // is the whole point: it may dispatch a job that writes the file.
    expect(gate.block).toBe(true);
    expect(String((gate as { reason?: string }).reason)).toContain("ac-1");
    ctx.cleanup();
  });
});

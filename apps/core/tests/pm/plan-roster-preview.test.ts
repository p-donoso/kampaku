import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { bootstrapKampakuPlatformTeam } from "../../src/application/bootstrap/kampaku-platform-team.js";
import { createProject } from "../../src/application/projects.js";
import { submitIntent } from "../../src/application/pm/submit-intent.js";
import type { PlanAndDelegateContext } from "../../src/delegator/plan-and-delegate.js";
import type { PlannedProject } from "../../src/delegator/types.js";

/**
 * **A plan the emperor approves is the plan that is persisted, or the difference is reported before it is
 * applied.**
 *
 * Measured on suite 08's fifth re-run (`s08r12`, 2026-10-04, BOARD F-102), end to end on a fresh data dir. The
 * plan previewed four platform stations, the apply refused all four — correctly, on the standing rule that an
 * external project (`project_slug !== "kampaku"`) may not be staffed by `kampaku-manager`'s subtree — and all
 * four leaves were **quietly re-owned** by the project's single lead with the preview's criteria persisted
 * unchanged. One of those criteria was:
 *
 * ```text
 * The auditor authored none of leaves one to three and modified no file other than its own gate document.
 * ```
 *
 * on a project whose only agent was the author of all of them. A criterion satisfiable by no seat the project
 * can have was written, previewed, approved and applied — and it surfaced four leaves and three succeeded jobs
 * later, as a blocked leaf the run stopped on. The run scored nothing rather than score it wrongly, which is
 * the honest outcome of a plan the platform could not have known was unstaffable.
 *
 * What this file locks, in the product's own terms:
 *
 * 1. **The previewed roster is validated at preview time.** Every owner the plan declared is resolved by the
 *    same rules the apply uses, and what cannot be honoured is named — declared slug, the project's actual
 *    roster, and the seat the leaf will get instead — in the response the emperor reads.
 * 2. **The plan that is recorded is the plan that will be persisted.** The preview record carries the resolved
 *    owners, so an approval cannot be an approval of a roster nobody will ever see again.
 * 3. **A criterion that requires an author other than the leaf's own is caught where it is written.** On a
 *    project that can field one seat that criterion is unsatisfiable, and the plan says so before it is
 *    applied rather than at the moment someone tries to sign it.
 * 4. **The control, in both directions.** A project that *can* staff a second seat is not told anything, and a
 *    plan whose owners the project actually has is left exactly as declared.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chat: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

/** Leaf descriptions must clear the plan validator's 200-character floor. */
function description(line: string): string {
  return (
    `${line} One concern only, sized to a single agent's turn. This leaf belongs to the walking skeleton and ` +
    `must leave the repository's own declared checks green when it closes, reporting the commands it ran and ` +
    `their output rather than describing them. Nothing outside the leaf's own scope is touched, and any ` +
    `limitation is stated in the closing report instead of worked around.`
  );
}

/** The plan suite 08's run `s08r12` actually previewed: four platform stations, one of them an independence gate. */
function walkingSkeletonPlan(): PlannedProject {
  const container = "Walking skeleton - CLI word-count path";
  return {
    project: {
      name: "textstats",
      slug: "textstats",
      description: "Give the word statistics a command-line entry point.",
    },
    project_lead_slug: "textstats-lead",
    work_items: [
      {
        title: container,
        description: description("Phase container for the walking skeleton."),
        priority: 0,
        assignee_slug: "textstats-lead",
        acceptance_criteria: [
          "The four leaf work items exist under this container with parent_ref set to this exact title, and no orphan root task exists in the project.",
        ],
      },
      {
        title: "Implement textstats.cli and the runnable __main__ module",
        description: description("Wire the CLI entry point over the existing word counter."),
        priority: 1,
        parent_ref: container,
        assignee_slug: "kampaku-fullstack",
        acceptance_criteria: [
          "The file exists at src/textstats/cli.py and src/textstats/__main__.py after the leaf runs.",
          "make check exits 0.",
        ],
      },
      {
        title: "Test the CLI through its public invocation path",
        description: description("Exercise the entry point the way a caller does."),
        priority: 2,
        parent_ref: container,
        assignee_slug: "kampaku-qa",
        acceptance_criteria: [
          "The file exists at tests/test_cli.py and tests/fixtures/sample.txt after the leaf runs.",
          "make check exits 0.",
        ],
      },
      {
        title: "Make README and AGENTS.md true for the new CLI",
        description: description("Bring the documents in line with the entry point that now exists."),
        priority: 3,
        parent_ref: container,
        assignee_slug: "kampaku-documenter",
        acceptance_criteria: [
          "The file exists at README.md with a runnable invocation of the new entry point.",
          "make check exits 0.",
        ],
      },
      {
        title: "Phase-gate: independently verify the walking skeleton on the frozen revision",
        description: description("Sign the phase off on the revision the other leaves produced."),
        priority: 4,
        parent_ref: container,
        assignee_slug: "kampaku-auditor",
        acceptance_criteria: [
          // The measured criterion, verbatim.
          "The auditor authored none of leaves one to three and modified no file other than its own gate document.",
          "The file exists at docs/architecture/cli-walking-skeleton.md after the leaf runs.",
        ],
      },
    ],
  };
}

describe("pm — the roster a plan previews is the roster the apply persists (BOARD F-102)", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.resetAllMocks();
  });

  /**
   * A project staffed the way this run's was: the platform team exists on the instance, and the project has
   * **one** seat under its own lead. `seatsUnderLead` is the knob the control tests turn.
   */
  function fixture(slug: string, seatsUnderLead: string[] = [], options: { leadSlug?: string | null } = {}) {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-f102-roster-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "llm",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);

    // The platform team the apply's rule is about: `kampaku-manager` and its subtree.
    bootstrapKampakuPlatformTeam(agentStore);

    const leadSlug = options.leadSlug === null ? null : options.leadSlug ?? `${slug}-lead`;
    const lead = leadSlug
      ? agentStore.createSubAgent({
          slug: leadSlug,
          name: `${slug} lead`,
          responsibilities: `Own the ${slug} work order`,
          systemPrompt: `You lead ${slug}.`,
          parentId: agentStore.getKampakuAgent().id,
        })
      : undefined;
    for (const seat of seatsUnderLead) {
      agentStore.createSubAgent({
        slug: seat,
        name: seat,
        responsibilities: `Own ${seat} work`,
        systemPrompt: `You work ${seat}.`,
        parentId: lead!.id,
      });
    }

    const project = createProject(store, {
      name: slug,
      slug,
      description: `Work order ${slug}`,
      repositories: [],
    });
    if (lead) store.updateProjectPlanning(project.id, { projectLeadAgentId: lead.id });

    const ctx: PlanAndDelegateContext = { store, pmStore, agentStore, config };
    return { ctx, store, pmStore, agentStore, project, lead };
  }

  /** The plan comes from the mocked planner, so the roster under test is the only variable. */
  function plannerReturns(plan: PlannedProject) {
    mockBroker.isAvailable.mockResolvedValue(true);
    mockBroker.chat.mockResolvedValue({ content: JSON.stringify(plan) });
  }

  async function preview(ctx: PlanAndDelegateContext, slug: string) {
    return submitIntent(ctx, {
      intent: "Give a caller a command-line entry point for the word statistics.",
      projectSlug: slug,
      mode: "preview",
      granularity: "standard",
    });
  }

  it("names the roster it cannot staff, and reports it in the response, before anything is applied", async () => {
    const { ctx } = fixture("textstats");
    plannerReturns(walkingSkeletonPlan());

    const previewed = await preview(ctx, "textstats");

    // Every station the plan declared under a platform lead is refused, by name, with the seat the project
    // actually has named beside it. Before this check the preview said nothing and the apply substituted
    // silently.
    const refused = previewed.rosterFindings.filter((finding) => finding.kind === "roster_refused");
    expect(refused.map((finding) => finding.title).sort()).toEqual([
      "Implement textstats.cli and the runnable __main__ module",
      "Make README and AGENTS.md true for the new CLI",
      "Phase-gate: independently verify the walking skeleton on the frozen revision",
      "Test the CLI through its public invocation path",
    ]);
    for (const finding of refused) {
      expect(finding.detail).toMatch(/kampaku-(fullstack|qa|documenter|auditor)/);
      expect(finding.detail).toContain("textstats-lead");
    }

    // And the response the emperor reads carries it, not only a structured field the caller has to know about.
    expect(previewed.summary).toMatch(/Roster check/);
    expect(previewed.summary).toContain("kampaku-fullstack");
    expect(previewed.summary).toContain("textstats-lead");

    // The assignments the preview lists are the owners that will land, not the ones the plan declared.
    for (const assignment of previewed.assignments) {
      expect(assignment.assigneeSlug).toBe("textstats-lead");
    }
  });

  it("records the resolved roster, so the plan approved is the plan that will be persisted", async () => {
    const { ctx, store } = fixture("textstats");
    plannerReturns(walkingSkeletonPlan());

    const previewed = await preview(ctx, "textstats");
    const recorded = store.getPlanPreview(previewed.approvalReference!);
    expect(recorded, "the preview is recorded").toBeDefined();

    // The fix, in one assertion: no leaf of the recorded plan names an owner this project cannot have.
    const owners = recorded!.plan.work_items.map((item) => item.assignee_slug);
    expect(owners).toEqual([
      "textstats-lead",
      "textstats-lead",
      "textstats-lead",
      "textstats-lead",
      "textstats-lead",
    ]);
  });

  it("catches a criterion that needs a station the project cannot have where the criterion is written", async () => {
    const { ctx } = fixture("textstats");
    plannerReturns(walkingSkeletonPlan());

    const previewed = await preview(ctx, "textstats");

    const unsatisfiable = previewed.rosterFindings.filter(
      (finding) => finding.kind === "criterion_unstaffable",
    );
    expect(unsatisfiable).toHaveLength(1);
    expect(unsatisfiable[0]!.title).toBe(
      "Phase-gate: independently verify the walking skeleton on the frozen revision",
    );
    // The criterion itself, quoted, so the reader can decide whether to restate it or staff a second seat.
    expect(unsatisfiable[0]!.detail).toContain("authored none of leaves one to three");
    expect(unsatisfiable[0]!.detail).toMatch(/1 seat/);
    // And the honest path is stated as a choice rather than as a wall.
    expect(unsatisfiable[0]!.detail).toMatch(/Add the station before approving/);
  });

  it("persists exactly the roster it previewed, and says nothing more once the seats exist", async () => {
    const { ctx, store, pmStore, project } = fixture("textstats", ["textstats-verifier"]);
    // The same plan, with the gate given to a seat the project actually has — the repair the emperor chose
    // after the run, taken before the apply instead of four leaves into it.
    const plan = walkingSkeletonPlan();
    plan.work_items[1]!.assignee_slug = "textstats-lead";
    plan.work_items[2]!.assignee_slug = "textstats-lead";
    plan.work_items[3]!.assignee_slug = "textstats-lead";
    plan.work_items[4]!.assignee_slug = "textstats-verifier";
    plannerReturns(plan);

    const previewed = await preview(ctx, "textstats");
    // The control: a roster the project can staff is not a finding, in either direction.
    expect(previewed.rosterFindings).toEqual([]);
    expect(previewed.summary).not.toMatch(/Roster check/);
    expect(previewed.assignments.map((assignment) => assignment.assigneeSlug)).toEqual([
      "textstats-lead",
      "textstats-lead",
      "textstats-lead",
      "textstats-lead",
      "textstats-verifier",
    ]);

    store.recordPlanApproval({
      projectSlug: "textstats",
      approvalReference: previewed.approvalReference!,
      planFingerprint: previewed.planFingerprint!,
      planContentHash: previewed.planContentHash!,
      agentId: "00000000-0000-4000-8000-000000000001",
    });

    const applied = await submitIntent(ctx, {
      intent: "Give a caller a command-line entry point for the word statistics.",
      projectSlug: "textstats",
      mode: "apply",
      granularity: "standard",
      approvalReference: previewed.approvalReference,
      approvalFingerprint: previewed.planFingerprint,
      approvalContentHash: previewed.planContentHash,
    });

    // The promise, in durable state: the owners the preview listed are the owners the work items carry.
    const persisted = pmStore.listWorkItemsByProject(project.id);
    const byTitle = new Map(persisted.map((item) => [item.title, item]));
    for (const assignment of previewed.assignments) {
      const item = byTitle.get(assignment.title)!;
      const owner = assignment.assigneeSlug;
      expect(
        ctx.agentStore.getAgentBySlugOrId(item.assigneeAgentId!)?.slug,
        `"${assignment.title}" was previewed to ${owner}`,
      ).toBe(owner);
    }
    expect(applied.rosterFindings).toEqual([]);
  });

  it("reads the same requirement in the other spellings a real planner writes it in", async () => {
    // Measured 2026-10-04, re-driving this row on the run's own store with the real endpoint: the planner wrote
    // the gate's independence requirement as *"its signer slug appears in no Phase 1-5 leaf's assignee field"*,
    // *"the signer slug … does not appear among them"*, *"produced by the verifier and not copied from Phase 4"*
    // and *"no README, source or test file was edited by the verifier"* — none of which the first pattern read.
    // The check is right and was too narrow; a requirement a plan can state in several spellings has to be read
    // in several, and a criterion with no independence requirement in it must stay silent.
    const { ctx } = fixture("spellings");
    const plan = walkingSkeletonPlan();
    plan.work_items = plan.work_items.slice(0, 2);
    plan.work_items[1]!.title = "Phase-gate: sign the skeleton off on the frozen revision";
    plan.work_items[1]!.acceptance_criteria = [
      "evidence/gate/signature.json exists and its signer slug appears in no Phase 1-5 leaf's assignee field.",
    ];
    plannerReturns(plan);

    const previewed = await preview(ctx, "spellings");
    expect(
      previewed.rosterFindings.filter((finding) => finding.kind === "criterion_unstaffable"),
    ).toHaveLength(1);

    // The control: the same leaf with a criterion that requires no other author is not a finding of this kind.
    const quiet = walkingSkeletonPlan();
    quiet.work_items = quiet.work_items.slice(0, 2);
    quiet.work_items[1]!.title = "Phase-gate: sign the skeleton off on the frozen revision";
    quiet.work_items[1]!.acceptance_criteria = [
      "The file exists at docs/architecture/cli-walking-skeleton.md after the leaf runs.",
      "make check exits 0.",
    ];
    plannerReturns(quiet);
    const clean = await preview(ctx, "spellings");
    expect(clean.rosterFindings.filter((finding) => finding.kind === "criterion_unstaffable")).toEqual([]);
  });

  it("says so when it cannot even name a seat to put in the declared one's place", async () => {
    // The narrowest case: a project with no linked lead. There is nothing to rewrite the leaf to, so the
    // declaration stands and the finding is what refuses it — an honest dead end, not a silent substitution.
    // No lead agent exists on the instance either, so nothing can be inferred from the intent.
    const { ctx, pmStore, project } = fixture("no-lead-proj", [], { leadSlug: null });
    const plan = walkingSkeletonPlan();
    delete plan.project_lead_slug;
    plan.project = { name: "no-lead-proj", slug: "no-lead-proj" };
    plan.work_items = plan.work_items.slice(4);
    delete plan.work_items[0]!.parent_ref;
    plan.work_items[0]!.assignee_slug = "kampaku-auditor";
    plannerReturns(plan);

    const previewed = await preview(ctx, "no-lead-proj");
    const finding = previewed.rosterFindings.find((entry) => entry.kind === "roster_refused")!;
    expect(finding.detail).toMatch(/no lead is linked/);
    // Nothing was invented: the declared owner is what the plan still says.
    expect(ctx.store.getPlanPreview(previewed.approvalReference!)!.plan.work_items[0]!.assignee_slug).toBe(
      "kampaku-auditor",
    );

    const refused = await submitIntent(ctx, {
      intent: "Give a caller a command-line entry point for the word statistics.",
      projectSlug: "no-lead-proj",
      mode: "apply",
      granularity: "standard",
      approvalReference: previewed.approvalReference,
      approvalFingerprint: previewed.planFingerprint,
      approvalContentHash: previewed.planContentHash,
    }).then(
      () => "the apply was not refused",
      (error: unknown) => (error instanceof Error ? error.message : `not an Error: ${String(error)}`),
    );

    expect(String(refused)).toMatch(/Plan apply refused/);
    expect(pmStore.listWorkItemsByProject(project.id)).toHaveLength(0);
  });

  it("refuses an apply whose approved plan still names a roster the project cannot staff", async () => {
    // The belt as well as the brace: a preview recorded before this check existed, or a plan edited after its
    // preview, still carries an owner the project cannot have. The apply must refuse it by name rather than
    // quietly persisting the substitution — which is what the run measured, four leaves too late.
    const { ctx, store, pmStore, project } = fixture("textstats");

    // A preview recorded the way the product recorded one before this check existed: the plan as the planner
    // wrote it, platform stations and all. Built directly, because the live path now resolves the roster before
    // it records anything — that is the fix, and this is the state it has to keep refusing.
    const approvalReference = "plan-00000000-0000-4000-8000-000000000102";
    const planFingerprint = "f".repeat(64);
    const planContentHash = "a".repeat(64);
    store.recordPlanPreview({
      projectSlug: "textstats",
      approvalReference,
      planFingerprint,
      planContentHash,
      plan: walkingSkeletonPlan(),
      plannerUsed: "llm",
    });
    store.recordPlanApproval({
      projectSlug: "textstats",
      approvalReference,
      planFingerprint,
      planContentHash,
      agentId: "00000000-0000-4000-8000-000000000001",
    });

    const refused = await submitIntent(ctx, {
      intent: "Give a caller a command-line entry point for the word statistics.",
      projectSlug: "textstats",
      mode: "apply",
      granularity: "standard",
      approvalReference,
      approvalFingerprint: planFingerprint,
      approvalContentHash: planContentHash,
    }).then(
      () => "the apply was not refused",
      (error: unknown) => (error instanceof Error ? error.message : `not an Error: ${String(error)}`),
    );

    expect(String(refused)).toMatch(/Plan apply refused/);
    expect(String(refused)).toContain("kampaku-fullstack");
    expect(String(refused)).toContain("textstats-lead");
    expect(String(refused)).toMatch(/nothing was persisted/i);
    expect(pmStore.listWorkItemsByProject(project.id)).toHaveLength(0);
  });
});

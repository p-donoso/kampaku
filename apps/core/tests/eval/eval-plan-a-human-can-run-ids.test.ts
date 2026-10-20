import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext, type TestContext } from "../helpers/test-context.js";
import { createProject } from "../../src/application/projects.js";
import { printProjectOverview } from "../../src/cli/commands/projects.js";
import { assessPlanRoster } from "../../src/delegator/roster-validation.js";
import {
  explainBlockedWorkItem,
  pendingEscalationsForWorkItem,
} from "../../src/application/pm/blocked-item-explanation.js";
import { blockWorkItemSubtree } from "../../src/persistence/escalation-work-item.js";
import type { PlannedWorkItem } from "../../src/delegator/types.js";

/**
 * **Suite 07, run `s07r21` (2026-10-20) — a plan a human can run, read three ways.**
 *
 * The run produced the thing the suite is about: seven work items (one container, six leaves) with stable
 * ids, dependency edges keyed by id, owners, check commands derived from the repository's own `Makefile`
 * and acceptance evidence written into each leaf. All four of the suite's oracle bullets about the plan
 * held. Thirty seconds of an operator's time then showed three places where the artifact and the CLI
 * disagree about what the store holds — each one a sentence a human has to trust in order to run the plan.
 *
 * 1. **`projects show` printed no step id.** The cold reader answered from the CLI's own output and wrote
 *    *"The document provides only one id … the leaves have titles but no ids. So answer: no step ids are
 *    carried"*, while the store held seven. The oracle sentence the whole suite turns on — *"multiple steps
 *    with stable ids"* — was unreadable on the surface the protocol calls the canonical record. It also
 *    printed no id for the container, only its title, so nothing the operator copied into
 *    `kampaku projects release <id>` came from this command.
 * 2. **The roster finding said "add the station" and named no way to add one.** The plan's declared owners
 *    were refused (`no agent with slug "textstats-python" exists on this instance`), every leaf was
 *    re-owned by the lead, and the product raised a `required` gate whose recommended option was *"create
 *    all four"*. Nothing an operator or an agent could call creates a seat under a project's lead: the CLI
 *    had `agents tree|show|update|delete` and no `create`, while `POST /api/v1/agents` already carried the
 *    authority. The gate was answerable and the answer was unactionable.
 * 3. **A pending question froze the plan and the surfaces denied it.** `blockWorkItemSubtree` wrote
 *    `blocked` over the container and all six leaves and the journal recorded `escalation_paused_items`,
 *    and every read surface answered *"blocked and nothing accounts for it: no closure rule on it, none
 *    above it, and no pending escalation anywhere in its chain"* — with the command `kampaku projects
 *    release`, which releases a block that is not accounted for. The item was frozen by a pending
 *    **project-scoped** question, which `pendingEscalationsForWorkItem` filtered out because it matched on
 *    `workItemId` only. An operator following that sentence would release items instead of answering the
 *    question that holds them.
 *
 * Each case is a way a fix could be false: an id printed for the container but not the leaves; a command
 * named in a finding that no route behind it; a question named on the leaves that carry it and not on the
 * container above them.
 */
describe("eval 07 — the artifact a human runs is readable on the surface that runs it", () => {
  let context: TestContext | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    context?.cleanup();
    context = undefined;
  });

  const LEAF_ID = "f88ceb22-1681-4392-8432-a82c49907e11";
  const CONTAINER_ID = "dd3a9a36-8af0-4764-a8ab-dc37f71ffeb7";

  /** One project overview, shaped as the route returns it: container plus one leaf, each with an owner. */
  function overview() {
    const leaf = {
      id: LEAF_ID,
      projectId: "project-1",
      parentId: CONTAINER_ID,
      title: "Determine the report formatter",
      description: "",
      status: "todo",
      priority: "medium",
      sortOrder: 1,
      assigneeAgentId: "agent-1",
      assigneeSlug: "textstats-lead",
      routingReason: "Explicit assignee_slug: textstats-lead",
      acceptanceCriteria: ["format_report({\"one\": 2}) returns \"one\\t2\\n\""],
      dependsOn: [],
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
    } as unknown as Parameters<typeof printProjectOverview>[0]["workItems"][number]["item"];
    const container = {
      ...leaf,
      id: CONTAINER_ID,
      parentId: null,
      title: "Slice 1 — CLI end to end",
      acceptanceCriteria: [],
    } as typeof leaf;

    return {
      project: {
        id: "project-1",
        slug: "textstats",
        name: "textstats",
        status: "planning",
        description: "",
        projectLeadSlug: "textstats-lead",
        repositories: [],
        coherenceStrategy: undefined,
      },
      documents: [],
      milestones: [],
      workItems: [
        { item: container, children: [{ item: leaf, children: [] }] },
      ],
    } as unknown as Parameters<typeof printProjectOverview>[0];
  }

  it("prints the id of every step, not only of the container", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });

    printProjectOverview(overview());

    const text = lines.join("\n");
    expect(text).toContain(CONTAINER_ID);
    // The leaf's id is what an operator pastes into `kampaku projects release|closure <id>`; a title is
    // not an id, and the cold reader said so in one sentence.
    expect(text).toContain(LEAF_ID);
    expect(text).not.toContain("undefined");
  });

  it("names the command that creates the station a refused owner needs", () => {
    context = createTestContext("kampaku-plan-ids-");
    const { agentStore, skillStore, store } = context;

    const project = createProject(store, { name: "Textstats", slug: "textstats" });
    const lead = agentStore.createSubAgent({
      slug: "textstats-lead",
      name: "Textstats Lead",
      responsibilities: "Lead the project",
      systemPrompt: "Lead",
      parentId: agentStore.getKampakuAgent().id,
    });
    store.updateProjectPlanning(project.id, { projectLeadAgentId: lead.id });

    const items: PlannedWorkItem[] = [
      {
        title: "Determine the report formatter",
        description: "x".repeat(240),
        acceptance_criteria: ["`make check` exits 0"],
        assignee_slug: "textstats-python",
      },
    ];

    const assessment = assessPlanRoster(items, {
      projectSlug: "textstats",
      projectLeadSlug: "textstats-lead",
      agentStore,
    });
    void skillStore;

    const finding = assessment.findings.find((entry) => entry.kind === "roster_refused");
    expect(finding).toBeDefined();
    // The declared owner, the seat it would be created under, and the command — one line the operator or
    // the front office can act on. A finding that says "add the station" and stops has nothing behind it.
    expect(finding?.detail).toContain("kampaku agents create textstats-python");
    expect(finding?.detail).toContain("--parent textstats-lead");
  });

  it("names a project-scoped pending question as what holds a frozen plan", () => {
    context = createTestContext("kampaku-plan-question-block-");
    const { agentStore, pmStore, questionStore, journalStore, blockageStore, store } = context;

    const project = createProject(store, { name: "Textstats", slug: "textstats" });
    const lead = agentStore.createSubAgent({
      slug: "textstats-lead",
      name: "Textstats Lead",
      responsibilities: "Lead the project",
      systemPrompt: "Lead",
      parentId: agentStore.getKampakuAgent().id,
    });
    store.updateProjectPlanning(project.id, { projectLeadAgentId: lead.id });

    const at = "2026-10-20T00:00:00.000Z";
    const container = pmStore.createWorkItem({
      id: CONTAINER_ID,
      projectId: project.id,
      title: "Slice 1 — CLI end to end",
      status: "todo",
      priority: "medium",
      sortOrder: 0,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: at,
      updatedAt: at,
    });
    const leaf = pmStore.createWorkItem({
      id: LEAF_ID,
      projectId: project.id,
      parentId: container.id,
      title: "Determine the report formatter",
      status: "todo",
      priority: "medium",
      sortOrder: 1,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: at,
      updatedAt: at,
    });

    // What the run did: a project-scoped question (no work item named) freezes the whole subtree, exactly
    // as an escalation naming one item does — measured on `s07r21`, where the roster gate was asked about
    // the project and every one of the seven items read `blocked`.
    questionStore.ask({
      askedByAgentId: lead.id,
      question: "Create the four textstats specialist stations, or accept lead-only ownership for Slice 1?",
      projectId: project.id,
    });
    blockWorkItemSubtree(pmStore, container.id, project.id);

    const ctx = { pmStore, questionStore, journalStore, blockageStore, agentStore };

    // The container and the leaf are both frozen, and both sentences name the question rather than denying
    // that anything does.
    for (const item of [container, leaf]) {
      const escalations = pendingEscalationsForWorkItem(ctx, item.id, project.id);
      expect(escalations.map((entry) => entry.kind)).toContain("question");
      const explanation = explainBlockedWorkItem(ctx, item, project.slug);
      expect(explanation.detail).not.toContain("nothing accounts for it");
      expect(explanation.detail).toContain("kampaku questions answer");
    }

    // And the report, where every blocked item has an entry, says the same thing.
    const report = explainBlockedWorkItem(ctx, leaf, project.slug);
    expect(report.escalations.length).toBeGreaterThan(0);
  });
});

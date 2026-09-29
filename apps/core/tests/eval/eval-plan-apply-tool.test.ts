import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import { executeToolCall, type KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { nullsMeanAbsent, parsePlannedProject } from "../../src/delegator/types.js";

/**
 * Suite 07's third blocker: **the plan previewed, the plan approved, and the apply dropped its own
 * `approval_reference` on the way in.**
 *
 * Measured 2026-09-28 (suite 07, run 16), on a fresh data dir with the provider steady. Durable state shows
 * three preview/approve pairs, every one with matching fingerprint and content hash and a 24-hour expiry, and
 * **no `plan.applied` between them**:
 *
 * ```text
 * 01:16:22  plan.previewed  fp=388873766acb  ch=b37cdc40126a
 * 01:16:24  plan.approved   fp=388873766acb  ch=b37cdc40126a  expires 2026-09-30
 * 01:20:14  submit_intent   apply  -> refused
 * 01:25:27  plan.previewed  fp=25b8d3b7112c  ch=151e501e630d
 * 01:25:31  plan.approved   fp=25b8d3b7112c  ch=151e501e630d  expires 2026-09-30
 * 01:26:10  submit_intent   apply  -> refused
 * ```
 *
 * The project held **0 work items**, so the suite's central oracle was unscorable, and the turn stopped at its
 * 60-minute budget with the plan one call away — the same shape as F-063, one layer further in.
 *
 * The cause was a dropped field, not a logic error: `executeSubmitIntent` validated that `approval_reference`
 * was present, the tool schema advertised it, `SubmitIntentInput` declared it, `submitIntent` forwarded it, and
 * the object literal that built the call **did not pass it**. `planAndDelegate` therefore received
 * `approvalReference: undefined`, resolved no preview — and an apply with no preview takes the *planning* path,
 * so each refused apply re-derived a whole plan first (one model call per node per depth) and then answered
 * with a sentence that named no field. Five attempts, four minutes, two full re-plans; one of those re-plans
 * died on an unrelated `parent_ref` schema error and took the rest of the turn with it.
 *
 * Every test here drives `executeToolCall`, not the HTTP route, and that is the point: the REST route
 * (`POST /api/v1/intents`) passes `approvalReference` straight through and was already covered by
 * `eval-plan-durability.test.ts`, so a lock written there passed while the path a project lead actually uses
 * was broken. A guard has to hold the door the product walks through.
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

describe("eval 07 — a lead applies the plan it previewed and approved", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    vi.resetAllMocks();
  });

  /**
   * The plan comes from the **stub** planner on purpose: this file is about the apply path, so the plan
   * itself must be deterministic and free to produce. A test that needed a model to reach the apply would be
   * measuring two things at once.
   */
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-07-apply-"));
    dataDir = root;
    const workspaceRoot = join(root, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });

    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot,
      agentMode: "stub",
      plannerMode: "stub",
      planApprovalWindowMs: undefined,
    } as never);
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore: new ConversationStore(db),
      pmStore,
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      questionStore,
      blockageStore,
      journalStore,
      wikiStore: undefined,
      postActionStore: undefined,
      refusalStore: new RefusalStore(db),
      config,
    };
    return { ctx, config, root, store, pmStore };
  }

  /** A work order with its own linked lead, which is the authority `approve_plan` checks. */
  function projectWithLead(ctx: KampakuToolContext, slug: string, existingLeadId?: string) {
    const lead = existingLeadId
      ? ctx.agentStore.getAgentBySlugOrId(existingLeadId)!
      : ctx.agentStore.createSubAgent({
          slug: `${slug}-lead`,
          name: `${slug} lead`,
          responsibilities: "Own the work order",
          systemPrompt: "You lead.",
          parentId: KAMPAKU_BUILTIN_ID,
        });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: `${slug}`.padEnd(8, "0") + "-1111-4111-8111-111111111111",
      slug,
      name: slug,
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    return { lead, project };
  }

  async function call(
    ctx: KampakuToolContext,
    tool: string,
    args: Record<string, unknown>,
    scope: { agentId: string; projectId: string },
  ) {
    return executeToolCall(ctx, tool, JSON.stringify(args), scope).then(
      (result) => ({ ok: true as const, output: result.output as Record<string, string> }),
      (error: Error) => ({ ok: false as const, message: error.message }),
    );
  }

  /** preview → approve, returning the three values the apply consumes. */
  async function previewAndApprove(
    ctx: KampakuToolContext,
    project: { id: string; slug: string },
    leadId: string,
  ) {
    const preview = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: project.slug,
        mode: "preview",
      },
      { agentId: leadId, projectId: project.id },
    );
    expect(preview.ok, `the plan previews: ${preview.ok ? "" : preview.message}`).toBe(true);
    if (!preview.ok) throw new Error(preview.message);

    const { approvalReference, planFingerprint, planContentHash } = preview.output;
    expect(approvalReference, "the preview returns its reference").toBeTruthy();

    const approval = await call(
      ctx,
      "approve_plan",
      {
        agent_slug: `${project.slug}-lead`,
        project_slug: project.slug,
        approval_reference: approvalReference,
        plan_fingerprint: planFingerprint,
        plan_content_hash: planContentHash,
      },
      { agentId: leadId, projectId: project.id },
    );
    expect(approval.ok, `the plan is approved: ${approval.ok ? "" : approval.message}`).toBe(true);

    return { approvalReference, planFingerprint, planContentHash };
  }

  it("turns a previewed and approved plan into durable work items through the tool a lead calls", async () => {
    // The control, and the one that was missing. Before this lock the product had a passing test for the
    // same sequence over HTTP, so nothing failed while `submit_intent` dropped the reference — and suite 07
    // could not pass for four runs.
    const { ctx, pmStore } = setup();
    const { lead, project } = projectWithLead(ctx, "tool-apply");
    const { approvalReference, planFingerprint, planContentHash } = await previewAndApprove(
      ctx,
      project,
      lead.id,
    );

    expect(pmStore.listWorkItemsByProject(project.id), "a preview persists no step").toHaveLength(0);

    const applied = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: project.slug,
        mode: "apply",
        approval_reference: approvalReference,
        approval_fingerprint: planFingerprint,
        approval_content_hash: planContentHash,
      },
      { agentId: lead.id, projectId: project.id },
    );

    expect(applied.ok, `the approved plan applies: ${applied.ok ? "" : applied.message}`).toBe(true);
    // The promise, in durable state: the steps are rows, and none of them is done.
    const steps = pmStore.listWorkItemsByProject(project.id);
    expect(steps.length, "the applied plan is a set of work items").toBeGreaterThan(0);
    for (const step of steps) expect(step.status).not.toBe("done");
    // And it was free: an apply consumes the preview it was approved against, so it plans nothing.
    expect(mockBroker.chat, "an apply makes no planning call").not.toHaveBeenCalled();
  });

  it("refuses an apply whose reference resolves to no preview, without spending a model call", async () => {
    // A refusal must cost nothing, because a refused apply that re-plans is as expensive as a preview and can
    // be killed by anything planning can raise. Measured in run 16: four applies re-planned, and one of them
    // died on a schema slip in a single node — a refusal that was going to happen anyway took the turn.
    const { ctx, pmStore } = setup();
    const { lead, project } = projectWithLead(ctx, "unknown-ref");

    const refused = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: project.slug,
        mode: "apply",
        approval_reference: "plan-00000000-0000-4000-8000-000000000000",
        approval_fingerprint: "f".repeat(64),
        approval_content_hash: "a".repeat(64),
      },
      { agentId: lead.id, projectId: project.id },
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    // The message names the reference it looked for, so the caller can tell a bad reference from a lost
    // approval from a slug mismatch rather than repeating the same call.
    expect(refused.message).toMatch(/no previewed plan matches approval_reference/i);
    expect(refused.message).toContain("plan-00000000-0000-4000-8000-000000000000");
    expect(refused.message).toMatch(/nothing was persisted/i);
    expect(mockBroker.chat, "a refusal plans nothing").not.toHaveBeenCalled();
    expect(mockBroker.isAvailable, "a refusal consults no endpoint").not.toHaveBeenCalled();
    expect(pmStore.listWorkItemsByProject(project.id)).toHaveLength(0);
  });

  it("refuses an apply that drops approval_reference, and says which field", async () => {
    const { ctx } = setup();
    const { lead, project } = projectWithLead(ctx, "missing-ref");

    const refused = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: project.slug,
        mode: "apply",
        approval_fingerprint: "f".repeat(64),
        approval_content_hash: "a".repeat(64),
      },
      { agentId: lead.id, projectId: project.id },
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    // The boundary check names all four fields it needs, so the model that omitted one learns which.
    expect(refused.message).toMatch(/approval_reference/);
    expect(mockBroker.chat).not.toHaveBeenCalled();
  });

  it("names the fingerprint when the apply presents one the approval was not about", async () => {
    // Every unmet condition is reported with the values compared. A refusal that names nothing leaves a
    // caller no rational move but to repeat the call, which is what run 16 did five times.
    const { ctx } = setup();
    const { lead, project } = projectWithLead(ctx, "wrong-fingerprint");
    const { approvalReference, planContentHash } = await previewAndApprove(ctx, project, lead.id);

    const refused = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: project.slug,
        mode: "apply",
        approval_reference: approvalReference,
        approval_fingerprint: "b".repeat(64),
        approval_content_hash: planContentHash,
      },
      { agentId: lead.id, projectId: project.id },
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.message).toMatch(/approval_fingerprint/);
    // Both sides of the comparison, so the difference is visible rather than merely asserted.
    expect(refused.message).toContain("bbbbbbbbbbbb");
    expect(refused.message).toMatch(/does not match the previewed plan's/);
  });

  it("names the project when the apply points at a different one than the preview did", async () => {
    const { ctx } = setup();
    const { lead, project } = projectWithLead(ctx, "right-project");
    // The same seat leads both, so it is authorized to name either; the refusal that follows is about the
    // mismatch between the project it named and the project the preview belongs to, which is the condition
    // under test. An unauthorized seat would be refused one check earlier, and this test would be measuring
    // the wrong message.
    const other = projectWithLead(ctx, "other-project", lead.id);
    const { approvalReference, planFingerprint, planContentHash } = await previewAndApprove(
      ctx,
      project,
      lead.id,
    );

    const refused = await call(
      ctx,
      "submit_intent",
      {
        intent: "Give a caller a command-line entry point for the word statistics.",
        project_slug: other.project.slug,
        mode: "apply",
        approval_reference: approvalReference,
        approval_fingerprint: planFingerprint,
        approval_content_hash: planContentHash,
      },
      { agentId: lead.id, projectId: other.project.id },
    );

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.message).toMatch(/is not the project this plan was previewed for/);
    expect(refused.message).toContain("right-project");
  });
});

/**
 * The second killer in run 16, and it struck twice in the same turn.
 *
 * ```text
 * LLM planning failed; no generic fallback plan was created. ZodError: [{ "code": "invalid_type",
 *   "expected": "string", "received": "null", "path": ["work_items", 1, "parent_ref"] ... }]
 * ```
 *
 * `parent_ref` is `z.string().optional()`, which rejects `null` — and `null` is what a model writes for "this
 * node has no parent", because JSON has no `undefined`. One key in one node discarded a plan that had already
 * been paid for, twice, and each time the apply that followed was refused for a reason of its own. This is the
 * same defect `expandPhaseLeaves` fixed one layer over (F-066), so it is fixed at the schema boundary for
 * every optional position at once rather than field by field.
 */
describe("a null where a field is optional means the field is absent", () => {
  const plan = (item: Record<string, unknown>) => ({
    project: { name: "Textstats", slug: "textstats" },
    work_items: [
      {
        title: "Add the CLI entry point",
        description: "Give a caller a command-line entry point for the word statistics.",
        priority: 1,
        acceptance_criteria: ["python3 -m textstats --help exits 0"],
        ...item,
      },
    ],
  });

  it("parses a plan whose node writes null for the parent it does not have", () => {
    const parsed = parsePlannedProject(plan({ parent_ref: null, phase_key: null }));

    expect(parsed.work_items).toHaveLength(1);
    // Absent, not `null`: the type says "a string, or nothing", and nothing is what the model meant.
    expect(parsed.work_items[0]?.parent_ref).toBeUndefined();
    expect(parsed.work_items[0]?.phase_key).toBeUndefined();
  });

  it("keeps a real parent, and drops only the nulls", () => {
    const parsed = parsePlannedProject(
      plan({ parent_ref: "Phase 1 — entry surface", suggested_responsibility: null }),
    );

    expect(parsed.work_items[0]?.parent_ref).toBe("Phase 1 — entry surface");
    expect(parsed.work_items[0]?.suggested_responsibility).toBeUndefined();
  });

  it("drops a null inside a list rather than handing the parser an unusable element", () => {
    expect(nullsMeanAbsent({ acceptance_criteria: ["one", null, "two"] })).toEqual({
      acceptance_criteria: ["one", "two"],
    });
  });

  it("still fails a null where a value is genuinely required", () => {
    // The normalization removes an optional key; it does not invent one. A plan with no title is not a plan,
    // and pretending otherwise would trade a loud failure for a silent hole.
    expect(() => parsePlannedProject({ work_items: [{ title: null, description: "x" }] })).toThrow();
  });

  it("leaves a plan with no nulls byte-for-byte as it was", () => {
    const clean = plan({ parent_ref: "Phase 1 — entry surface" });
    expect(nullsMeanAbsent(clean)).toEqual(clean);
  });
});

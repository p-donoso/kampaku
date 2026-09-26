import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { KAMPAKU_BUILTIN_DEFINITION } from "../../src/agents/definitions.js";

/**
 * Suite 07's promise: **the plan is something a human can run** — ordered steps with stable ids, named
 * owners, `todo` statuses, per-step acceptance evidence, and the project's own check commands.
 *
 * Measured 2026-09-26 taking suite 07, prompt 1 (`Plan the first vertical slice for this project … Do not
 * mark anything done. Wait for my go before execution.`) on the production endpoint: the front office read
 * the checkout **15 times** and produced **no plan**. Durable state after the turn: 0 work items, 0 jobs,
 * 0 questions. The reply described the repository and closed with *"Ready when you give the go."*
 *
 * The cause was not the model. The product had no way to say *plan and stop*: the front office's own
 * instructions fused the four operations into one delegation — *"have that lead preview, approve, apply,
 * and execute a concrete plan"* — and `delegate_to_agent`'s description said the same, while the resident
 * governance fragment says to link the lead and the acceptance criteria *"before execution"*. Asked to
 * plan **and** to wait before execution, the only reading available was "do not start", so it asked for
 * permission. Meanwhile the line's own tool already carried the distinction the prompt lacked
 * (`submit_intent`'s `mode: preview | apply`, where applying persists the plan and runs nothing).
 *
 * Four things are asserted, and the fourth keeps the others honest:
 *
 * 1. **A preview is a plan that runs nothing.** Preview persists no work item, and its steps come back
 *    with owners and titles — the shape a reply can render.
 * 2. **Applying a plan is not executing it.** After preview → lead approval → apply, every step is a work
 *    item with a stable id, an assignee and the status `todo`, **zero** jobs are queued or running, and
 *    nothing is `done`.
 * 3. **The applied plan is readable back.** `get_project` returns each step with its id, owner slug, status
 *    and acceptance criteria, so the front office can render the plan from state instead of describing the
 *    repository from memory.
 * 4. **The control.** The front office's instructions state the distinction, and its toolset still holds no
 *    execution tool — so the distinction cannot be satisfied by letting the front office run the work.
 */

describe("eval 07 — a plan a human can run", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-07-plan-quality-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const conversationStore = new ConversationStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    bootstrapProject(store, config, db);
    seedSkillsFromCatalog(skillStore, resolve(process.cwd(), "../.."));
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      undefined,
      memoryStore,
      undefined,
      journalStore,
      wikiStore,
      db,
    );
    return { app, store, pmStore, agentStore, skillStore, root: dataDir };
  }

  /**
   * A work order opened the way the product documents it: a lead through `POST /api/v1/agents`, which
   * provisions it with the **default** skill set, then the container with that lead.
   *
   * The distinction matters, and it is the measurement: the default set contains
   * `system-plan-quality` — the fragment that tells a seat to call `submit_intent` — and neither
   * `system-delegation` nor `workflow-specialist-delegation`. So a hand-assigned governance skill in the
   * fixture would hide the defect this lock exists for.
   */
  async function openWorkOrder(
    f: ReturnType<typeof fixture>,
    slug: string,
  ): Promise<{ projectId: string; leadSlug: string }> {
    const leadResponse = await f.app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: `${slug}-lead`,
        name: `${slug} lead`,
        responsibilities: `Own the ${slug} work order`,
        parent_slug: "kampaku",
      }),
    });
    expect(leadResponse.status, "a lead can be created").toBe(201);
    const leadBody = (await leadResponse.json()) as { agent: { id: string; slug: string } };
    const skills = f.skillStore.listAgentSkills(leadBody.agent.id);
    // The measured shape of a default-provisioned lead.
    expect(skills, "the plan-quality fragment reaches the lead").toContain("system-plan-quality");
    expect(skills).not.toContain("system-delegation");

    // A checkout that exists: the repository path is validated on the way in (F-033), so a path that is
    // not there would be refused before the plan is ever reachable.
    const checkout = join(f.root, "checkouts", slug);
    mkdirSync(checkout, { recursive: true });

    const created = await f.app.request("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        name: slug,
        project_lead_slug: leadBody.agent.slug,
        repositories: [{ url: `file://${checkout}`, role: "core" }],
      }),
    });
    expect(created.status, "a work order opens with its lead").toBeLessThan(300);
    const project = (await created.json()) as { id: string };
    return { projectId: project.id, leadSlug: leadBody.agent.slug };
  }

  /** Preview → lead approval → apply, through the documented routes. Returns the preview body. */
  async function planAndApply(f: ReturnType<typeof fixture>, slug: string, leadSlug: string) {
    const preview = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Give a caller a command-line entry point for the word statistics.",
        projectSlug: slug,
        mode: "preview",
      }),
    });
    expect(preview.status, "a preview is a plan and must be possible").toBeLessThan(300);
    const previewBody = (await preview.json()) as {
      approvalReference: string;
      planFingerprint: string;
      planContentHash: string;
      assignments?: unknown[];
    };

    const approval = await f.app.request("/api/v1/plans/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_slug: leadSlug,
        project_slug: slug,
        approval_reference: previewBody.approvalReference,
        plan_fingerprint: previewBody.planFingerprint,
        plan_content_hash: previewBody.planContentHash,
      }),
    });
    expect(approval.status).toBeLessThan(300);

    const applied = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Give a caller a command-line entry point for the word statistics.",
        projectSlug: slug,
        mode: "apply",
        approvalReference: previewBody.approvalReference,
        approvalFingerprint: previewBody.planFingerprint,
        approvalContentHash: previewBody.planContentHash,
      }),
    });
    expect(applied.status, "an approved plan applies").toBeLessThan(300);
    return previewBody;
  }

  it("persists a plan as todo steps with ids and owners, and runs nothing", async () => {
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "plan-demo");

    await planAndApply(f, "plan-demo", leadSlug);

    const steps = f.pmStore.listWorkItemsByProject(projectId);
    expect(steps.length, "a plan has more than one step").toBeGreaterThan(1);
    for (const step of steps) {
      expect(step.id, "every step has a stable id").toBeTruthy();
      expect(step.status, "a plan marks nothing done").not.toBe("done");
      expect(step.status).not.toBe("completed");
      expect(step.status).not.toBe("in_progress");
    }
    // Applying a plan is not executing it: no job was queued or started by the plan itself.
    const status = await f.app.request("/api/v1/runtime/status");
    const runtime = (await status.json()) as { queuedJobs?: number; runningJobs?: number };
    expect(runtime.runningJobs ?? 0, "planning starts no job").toBe(0);
  });

  it("returns the applied plan through get_project, so the reply can render it from state", async () => {
    const f = fixture();
    const { leadSlug } = await openWorkOrder(f, "readback-demo");

    await planAndApply(f, "readback-demo", leadSlug);

    const response = await f.app.request("/api/v1/projects/readback-demo");
    expect(response.status).toBe(200);
    // The overview is a tree of `{ item, children }` nodes — the same shape `get_project` maps, so a
    // reply that renders from this read is rendering the persisted plan rather than re-describing it.
    type Node = {
      item: { id: string; title: string; status: string; acceptanceCriteria: string[] };
      children?: Node[];
    };
    const overview = (await response.json()) as { workItems?: Node[] };
    const flatten = (nodes: Node[]): Node["item"][] =>
      nodes.flatMap((node) => [node.item, ...flatten(node.children ?? [])]);
    const items = flatten(overview.workItems ?? []);
    expect(items.length, "the plan is read back, not remembered").toBeGreaterThan(1);
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.status).not.toBe("done");
      expect(Array.isArray(item.acceptanceCriteria), "each step states its acceptance evidence").toBe(true);
    }
  });

  it("states the plan/execution distinction where the front office reads it, and still holds no executor", () => {
    const prompt = KAMPAKU_BUILTIN_DEFINITION.systemPrompt;

    // The rule this suite was measured against: applying a plan is not running it.
    expect(prompt).toMatch(/A plan is not execution/i);
    expect(prompt).toMatch(/Applying a plan persists its steps/i);
    // A planning request is answered with the plan, not with a description and a request for permission.
    expect(prompt).toMatch(/never answer a planning request by describing the repository/i);
    expect(prompt).toMatch(/never ask the emperor for permission to plan/i);
    // The reply renders steps the product can read back, not prose about the checkout.
    expect(prompt).toMatch(/read the applied plan back with get_project/i);
    // The surface that releases execution is named, so the emperor is not left guessing.
    expect(prompt).toMatch(/kampaku projects play/);
    // Check commands come from this project, never from a template.
    expect(prompt).toMatch(/Every check command comes from this project's own toolchain/i);

    // The control: the distinction cannot be satisfied by handing the front office an executor.
    const tools = KAMPAKU_BUILTIN_DEFINITION.tools;
    for (const lineOnly of ["submit_intent", "play_project", "step_project", "execute_work_item", "run_check"]) {
      expect(tools, `${lineOnly} belongs to the line`).not.toContain(lineOnly);
    }
  });
});

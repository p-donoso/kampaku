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

/**
 * Suite 07's blocking gap, measured twice on 2026-09-26: **a plan that was never applied.**
 *
 * Run 4: the lead previewed a real plan and approved it with an expiry already nine months past, so the
 * apply was refused and the project held 0 work items. Fixed — see `DEFAULT_PLAN_APPROVAL_WINDOW_MS`.
 *
 * Run 5, after that fix, on a fresh instance: the lead called `read_repository` eight times, then
 * `submit_intent` **eleven times**, then `get_project`, and **never called `approve_plan` once**. Durable
 * state again held 0 work items, and it presented the preview to the emperor as an "Applied Plan". The
 * cause was in the product's own text, not in the model: the fragment that governs the plan path
 * (`system-plan-quality`) describes what a plan must contain and tells the seat to *"call submit_intent
 * again on the same project_slug"* when the leaf count is thin — and never states the preview → approve →
 * apply sequence that makes a plan durable. `approve_plan` was in that fragment's `allowed-tools` and
 * nowhere in its body. This is F-055's shape one layer in: the line's *body* text lacked the distinction
 * its own tools already carried.
 *
 * So this lock ties the text to the behaviour, and the ordering matters:
 *
 * 1. the fragment must state the three steps, in order, and that a preview persists nothing;
 * 2. the fragment must forbid repeating previews as a way of making progress;
 * 3. **a preview really does persist nothing** while returning the three values an apply needs — so the
 *    sentence is a description of the product, not a slogan;
 * 4. **the same three values, approved and applied, do persist the steps** — the control. Without it,
 *    sentence 1 could be satisfied by text describing a path that does not work.
 */
describe("eval 07 — a plan is durable only when it is applied", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-07-durability-"));
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
    return { app, store, pmStore, skillStore };
  }

  /** Opens a work order the way the product documents it, and returns what the routes need. */
  async function openWorkOrder(f: ReturnType<typeof fixture>, slug: string) {
    const leadResponse = await f.app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: `${slug}-lead`, name: `${slug} lead`, parent_slug: "kampaku" }),
    });
    const leadBody = (await leadResponse.json()) as { agent: { id: string; slug: string } };
    const checkout = join(dataDir, "checkouts", slug);
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
    const project = (await created.json()) as { id: string };
    return { projectId: project.id, leadSlug: leadBody.agent.slug, leadId: leadBody.agent.id };
  }

  it("states preview → approve → apply, and forbids re-previewing as progress", () => {
    // The fragment as the seat receives it, from the catalog the workspace serves.
    const catalog = resolve(process.cwd(), "../../packages/contracts/skills");
    const fs = require("node:fs") as typeof import("node:fs");
    const fragment = fs.readFileSync(join(catalog, "system-plan-quality/SKILL.md"), "utf8");

    // The rule the measurement was about: a preview is not a plan.
    expect(fragment).toMatch(/A preview is not a plan/);
    expect(fragment).toMatch(/persists \*\*nothing\*\*|persists nothing/);
    // The three steps, named, and the apply described as the call that persists.
    expect(fragment).toMatch(/preview → approve → apply/i);
    expect(fragment).toMatch(/`approve_plan` with your own `agent_slug`/);
    expect(fragment).toMatch(/`mode: "apply"`/);
    expect(fragment).toMatch(/This is the call that persists the steps as work items/);
    // The expiry rule that run 4 died on, stated where the seat plans rather than only in the tool schema.
    expect(fragment).toMatch(/Omit `expires_at`, or pass a timestamp in the future/);
    // And the measured anti-pattern, named with its consequence.
    expect(fragment).toMatch(/Do not call `submit_intent` repeatedly to chase the leaf budget/);
    expect(fragment).toMatch(/eleven times/);
    // The honest-reporting rule: a preview is never presented as an applied plan.
    expect(fragment).toMatch(/never present a preview as an applied plan/i);
  });

  it("a preview persists nothing but hands over everything an apply needs", async () => {
    // Sentence 1 of the fragment, checked against the product: this is why the preview is not a plan, and
    // why losing its three values loses the plan.
    const f = fixture();
    const { projectId } = await openWorkOrder(f, "durable-demo");

    const preview = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Give a caller a command-line entry point for the word statistics.",
        projectSlug: "durable-demo",
        mode: "preview",
      }),
    });
    expect(preview.status, "the plan previews").toBeLessThan(300);
    const body = (await preview.json()) as {
      approvalReference?: string;
      planFingerprint?: string;
      planContentHash?: string;
      workItemsCreated?: number;
    };

    // Nothing durable: the preview is the plan held in a response.
    expect(f.store.getPlanPreview(body.approvalReference ?? ""), "the preview is readable for the approval").toBeDefined();
    expect(f.pmStore.listWorkItemsByProject(projectId), "a preview creates no step").toHaveLength(0);
    // And it carried the three values the next two calls consume — the ones the run's lead dropped.
    expect(body.approvalReference, "the preview returns its reference").toBeTruthy();
    expect(body.planFingerprint, "the preview returns its fingerprint").toBeTruthy();
    expect(body.planContentHash, "the preview returns its content hash").toBeTruthy();
  });

  it("the same three values, approved and applied, turn the preview into work items", async () => {
    // The control for the first sentence: the path the fragment now describes actually works, and the
    // evidence is the steps as durable rows rather than a reply that says they exist.
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "applied-demo");

    const preview = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Give a caller a command-line entry point for the word statistics.",
        projectSlug: "applied-demo",
        mode: "preview",
      }),
    });
    const { approvalReference, planFingerprint, planContentHash } = (await preview.json()) as {
      approvalReference: string;
      planFingerprint: string;
      planContentHash: string;
    };

    // Approve **without** expires_at, the way the fragment now tells a seat to — the default window is the
    // platform's, not a date the model invents.
    const approval = await f.app.request("/api/v1/plans/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agent_slug: leadSlug,
        project_slug: "applied-demo",
        approval_reference: approvalReference,
        plan_fingerprint: planFingerprint,
        plan_content_hash: planContentHash,
      }),
    });
    expect(approval.status, "an approval with no expiry is accepted").toBeLessThan(300);

    const applied = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Give a caller a command-line entry point for the word statistics.",
        projectSlug: "applied-demo",
        mode: "apply",
        approvalReference,
        approvalFingerprint: planFingerprint,
        approvalContentHash: planContentHash,
      }),
    });
    expect(applied.status, "an approved plan applies").toBeLessThan(300);

    // The promise, in durable state: steps exist, they have ids, none is done.
    const steps = f.pmStore.listWorkItemsByProject(projectId);
    expect(steps.length, "the applied plan is a set of work items").toBeGreaterThan(1);
    for (const step of steps) {
      expect(step.id).toBeTruthy();
      expect(step.status).not.toBe("done");
    }
    // Nothing ran: applying a plan is not executing it.
    const runtime = (await (await f.app.request("/api/v1/runtime/status")).json()) as {
      runningJobs?: number;
      queuedJobs?: number;
    };
    expect(runtime.runningJobs ?? 0).toBe(0);
    expect(runtime.queuedJobs ?? 0).toBe(0);
  });
});

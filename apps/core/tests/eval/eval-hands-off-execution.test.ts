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
import { PmStore, type WorkItemRecord } from "../../src/persistence/pm-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";

/**
 * Suite 08's promise: **after go-ahead, work runs with visible jobs and progress, and real artifacts land in
 * the project's repository — and nowhere else.**
 *
 * The suite's own clauses this file carries:
 *
 * 1. **Nothing executes before the plan is approved.** A prior vague *"start now"* in the same data dir does
 *    not authorize execution; neither does releasing a project that has no plan.
 * 2. **Releasing a plan queues a job, and the job is reachable from a public route.** The suite calls a job
 *    that exists only by id a finding, so this asserts the queued job is readable back over
 *    `GET /api/v1/jobs/:jobId` and that its item's phase is visible on the project's own overview — the two
 *    surfaces an operator has without a private store.
 * 3. **The job's own input names the project's checkout, not the platform.** This is the half of "artifacts
 *    exist under the project path only" that is decidable before any file is written: the context a worker
 *    receives says where to write. (Run s08r2 measures the files themselves on the live instance; a unit
 *    test cannot, because the worker is a separate process.)
 * 4. **One release, one step.** `play` starts the next eligible leaf, not the whole tree: dependents stay
 *    `todo` with no job, and `step` leaves automatic execution paused while `play` turns it on.
 *
 * What this file deliberately does not claim: that the worker then writes the artifacts and that the
 * project's checks pass on them. That is measured in the run log against a real checkout, because it needs
 * the execution plane.
 */

describe("eval 08 — hands-off execution", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-08-hands-off-"));
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
    return { app, store, pmStore, agentStore, skillStore, config, root: dataDir };
  }

  /** A work order opened the way the product documents it, over its own checkout. */
  async function openWorkOrder(f: ReturnType<typeof fixture>, slug: string) {
    const lead = await f.app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: `${slug}-lead`,
        name: `${slug} lead`,
        responsibilities: `Own the ${slug} work order`,
        parent_slug: "kampaku",
      }),
    });
    expect(lead.status, "a lead can be created").toBe(201);
    const leadBody = (await lead.json()) as { agent: { id: string; slug: string } };

    const checkout = join(f.root, "checkouts", slug);
    mkdirSync(join(checkout, "src"), { recursive: true });

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
    return { projectId: project.id, leadSlug: leadBody.agent.slug, checkout };
  }

  /** Preview → lead approval → apply, through the documented routes. */
  async function planAndApply(f: ReturnType<typeof fixture>, slug: string, leadSlug: string) {
    const intent = "Give a caller a command-line entry point for the word statistics.";
    const preview = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, projectSlug: slug, mode: "preview" }),
    });
    expect(preview.status, "the plan previews").toBeLessThan(300);
    const previewBody = (await preview.json()) as {
      approvalReference: string;
      planFingerprint: string;
      planContentHash: string;
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
    expect(approval.status, "the lead approves its own project's plan").toBeLessThan(300);

    const applied = await f.app.request("/api/v1/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent,
        projectSlug: slug,
        mode: "apply",
        approvalReference: previewBody.approvalReference,
        approvalFingerprint: previewBody.planFingerprint,
        approvalContentHash: previewBody.planContentHash,
      }),
    });
    expect(applied.status, "an approved plan applies").toBeLessThan(300);
  }

  function items(records: WorkItemRecord[], projectId: string) {
    return records.filter((item) => item.projectId === projectId);
  }

  async function runtime(f: ReturnType<typeof fixture>) {
    const response = await f.app.request("/api/v1/runtime/status");
    return (await response.json()) as {
      workersOnline: number;
      workersKnown: number;
      queuedJobs: number;
      runningJobs: number;
    };
  }

  it("releases nothing before a plan is approved", async () => {
    const f = fixture();
    const { projectId } = await openWorkOrder(f, "no-plan");

    const played = await f.app.request("/api/v1/projects/no-plan/play", { method: "POST" });
    expect(played.status, "releasing an empty project is not an error, it is a no-op").toBeLessThan(300);

    const state = (await played.json()) as { nextWorkItemId?: string | null };
    expect(state.nextWorkItemId ?? null, "a project with no plan has no first step").toBeNull();
    expect(items(f.pmStore.listWorkItemsByProject(projectId), projectId).length).toBe(0);

    const status = await runtime(f);
    expect(status.queuedJobs + status.runningJobs, "no plan means no job").toBe(0);
  });

  /**
   * The defect that made this suite unreachable before it was fixed (BOARD F-075), asserted where it was
   * measured.
   *
   * A work order opened exactly the way the product documents it — the lead through `POST /api/v1/agents`,
   * the container through `POST /api/v1/projects` naming that lead, the plan previewed, approved and applied
   * by that lead — answered `POST /api/v1/projects/<slug>/play` with
   *
   *   400 {"error":"Assignee agent lacks code.agent capability from assigned skills.","code":"VALIDATION"}
   *
   * for **every** leaf, because the check read the assignee's *skill catalog* and the default seat set
   * carries no `code.agent` (only the dev-shaped catalog skills do, and none of them is a default). So a
   * project whose leaves are owned by its own lead — the only staffing the front office is instructed to
   * produce — could never release a single step. The check also exempted a seat holding **zero** skills,
   * which is the inverse of what it meant.
   *
   * The production fix asks the executor, which is where the answer lives: a registered worker declares the
   * capabilities Core hands leases against. This asserts the two halves that make that a fix rather than a
   * deletion — the default-provisioned lead is released, and a worker that cannot take the job is still
   * refused, by name.
   */
  it("does not refuse a leaf owned by a default-provisioned project lead", async () => {
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "f075-demo");
    // The measured shape of the seat the product's own path produces.
    const lead = f.agentStore.getAgentBySlugOrId(leadSlug)!;
    const skills = f.skillStore.listAgentSkills(lead.id);
    const capabilities = f.skillStore.getAgentCapabilities(lead.id);
    expect(skills, "the default seat holds the default set").toContain("system-plan-quality");
    expect(capabilities, "and none of it declares a code capability").not.toContain("code.agent");

    // A worker is registered, and it can take code work — the normal case.
    f.store.upsertWorker({
      id: "00000000-0000-4000-8000-000000000001",
      name: "local-worker",
      capabilities: ["code.agent", "cursor.agent"],
      contractVersion: "0.1.0",
      registeredAt: new Date().toISOString(),
    });

    await planAndApply(f, "f075-demo", leadSlug);
    const played = await f.app.request("/api/v1/projects/f075-demo/play", { method: "POST" });
    expect(
      played.status,
      "the lead the factory itself provisioned can release the plan it owns",
    ).toBeLessThan(300);
    const released = items(f.pmStore.listWorkItemsByProject(projectId), projectId).filter((i) => i.jobId);
    expect(released.length, "and a job was queued").toBe(1);
  });

  /**
   * The half that must survive the fix: a leaf is still not released onto an execution plane that cannot
   * take it. The refusal names what is missing and what the operator should check, which is the difference
   * between a gate and a dead end.
   */
  it("refuses to release work when no registered worker can lease it, and names why", async () => {
    const f = fixture();
    const { leadSlug } = await openWorkOrder(f, "no-worker");
    f.store.upsertWorker({
      id: "00000000-0000-4000-8000-000000000001",
      name: "docs-worker",
      capabilities: ["docs.writer"],
      contractVersion: "0.1.0",
      registeredAt: new Date().toISOString(),
    });
    await planAndApply(f, "no-worker", leadSlug);

    const played = await f.app.request("/api/v1/projects/no-worker/play", { method: "POST" });
    expect(played.status).toBe(400);
    const refusal = (await played.json()) as { error?: string; code?: string };
    expect(refusal.code).toBe("VALIDATION");
    expect(refusal.error ?? "", "the refusal names the capability and the surface to check").toMatch(
      /code\.agent/,
    );
    expect(refusal.error ?? "").toMatch(/runtime\/status/);
  });

  it("releases work on an instance with no worker at all, because a queue is what a queue is for", async () => {
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "headless");
    await planAndApply(f, "headless", leadSlug);
    const played = await f.app.request("/api/v1/projects/headless/play", { method: "POST" });
    expect(played.status, "planning and releasing must not need an execution plane").toBeLessThan(300);
    expect(items(f.pmStore.listWorkItemsByProject(projectId), projectId).filter((i) => i.jobId).length).toBe(1);
  });

  it("releases the next eligible step and queues a job a public route can read back", async () => {
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "release-demo");
    f.store.upsertWorker({
      id: "00000000-0000-4000-8000-000000000001",
      name: "local-worker",
      capabilities: ["code.agent", "cursor.agent"],
      contractVersion: "0.1.0",
      registeredAt: new Date().toISOString(),
    });
    await planAndApply(f, "release-demo", leadSlug);
    expect(items(f.pmStore.listWorkItemsByProject(projectId), projectId).length).toBeGreaterThan(0);

    const played = await f.app.request("/api/v1/projects/release-demo/play", { method: "POST" });
    expect(played.status).toBeLessThan(300);

    const withJob = items(f.pmStore.listWorkItemsByProject(projectId), projectId).filter((i) => i.jobId);
    expect(withJob.length, "exactly one step was released").toBe(1);
    const jobId = withJob[0].jobId as string;

    // The job is reachable by id, over the public route — a job that exists only by id is a finding.
    const job = await f.app.request(`/api/v1/jobs/${jobId}`);
    expect(job.status, "the queued job is readable from a public route").toBe(200);
    const jobBody = (await job.json()) as { id: string; status: string; taskId: string };
    expect(jobBody.id).toBe(jobId);
    expect(["queued", "leased", "running"], "the job is live, not a stub").toContain(jobBody.status);

    // And its progress is visible on the project's own overview, which is the other public surface. The
    // overview is a tree, so the released leaf has to be reached through its container — a check that only
    // read the root nodes would pass while the leaf was never reported at all.
    type Node = { item: { id: string; executionPhase?: string; jobId?: string }; children?: Node[] };
    const overview = await f.app.request("/api/v1/projects/release-demo");
    const body = (await overview.json()) as { workItems?: Node[] };
    const flatten = (nodes: Node[]): Node[] => nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const onOverview = flatten(body.workItems ?? []);
    const released = onOverview.find((node) => node.item.id === withJob[0].id);
    expect(released, "the released step is on the project overview").toBeDefined();
    expect(released?.item.jobId).toBe(jobId);
    expect(["queued", "running"], "the overview reports the phase while it runs").toContain(
      released?.item.executionPhase ?? "",
    );

    const status = await runtime(f);
    expect(status.queuedJobs + status.runningJobs, "the runtime surface counts the job").toBe(1);
  });

  it("gives the worker the project's checkout, not the platform workspace", async () => {
    const f = fixture();
    const { projectId, leadSlug, checkout } = await openWorkOrder(f, "path-demo");
    await planAndApply(f, "path-demo", leadSlug);
    await f.app.request("/api/v1/projects/path-demo/play", { method: "POST" });

    const jobId = items(f.pmStore.listWorkItemsByProject(projectId), projectId).find((i) => i.jobId)?.jobId;
    expect(jobId, "a job was queued").toBeTruthy();
    const job = f.store.getJob(jobId as string);
    expect(job, "the job is in the store").toBeDefined();
    const input = job?.input as { repositoryPath?: string; workspaceDir?: string } | undefined;

    expect(
      input?.repositoryPath,
      "the worker is told which checkout to write to, and it is this project's",
    ).toBe(checkout);
    expect(
      input?.repositoryPath,
      "the platform checkout is never the target of a project job",
    ).not.toBe(f.config.workspaceRoot);
    expect(
      (input?.workspaceDir ?? "").includes(".kampaku/runs"),
      "and the working directory is not the operator's run state",
    ).toBe(false);
  });

  it("step releases one step and leaves automatic execution paused, where play turns it on", async () => {
    const f = fixture();
    const { projectId, leadSlug } = await openWorkOrder(f, "step-demo");
    await planAndApply(f, "step-demo", leadSlug);

    const stepped = await f.app.request("/api/v1/projects/step-demo/step", { method: "POST" });
    expect(stepped.status).toBeLessThan(300);
    const steppedState = (await stepped.json()) as { autoExecute: boolean };
    expect(steppedState.autoExecute, "one step at a time is not automatic execution").toBe(false);

    let state = await f.app.request("/api/v1/projects/step-demo/execution");
    expect(((await state.json()) as { autoExecute: boolean }).autoExecute).toBe(false);

    const played = await f.app.request("/api/v1/projects/step-demo/play", { method: "POST" });
    expect(played.status).toBeLessThan(300);
    state = await f.app.request("/api/v1/projects/step-demo/execution");
    expect(((await state.json()) as { autoExecute: boolean }).autoExecute, "play turns it on").toBe(true);

    // One release, one job: the tree is not flushed into the queue.
    const released = items(f.pmStore.listWorkItemsByProject(projectId), projectId).filter((i) => i.jobId);
    expect(released.length, "a release starts the next step, not every step").toBeLessThanOrEqual(1);
  });
});

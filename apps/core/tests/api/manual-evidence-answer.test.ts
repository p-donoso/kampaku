import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";

/**
 * The answer route is where a human decision becomes evidence, and where the leaf it was blocking closes.
 *
 * Measured 2026-09-30 on suite 08's fourth run (BOARD F-082): the closure gate refused a leaf for a criterion
 * only a person could decide, and nothing asked that person. Answering a question was already possible from
 * three surfaces — the web card, `kampaku questions answer`, and `POST /api/v1/questions/:id/answer` — so the
 * missing link was never a UI; it was this: an answer was recorded and read by no gate.
 *
 * This asserts the whole round trip over the public surfaces: a job that did the work lands its evidence, the
 * closure path raises the question, the operator answers it over HTTP, and the leaf closes **against the job
 * result already on record** rather than by spending a second job on the same work.
 */

describe("answered evidence gates close the work they were blocking", () => {
  let dataDir = "";
  const checkoutDirs: string[] = [];

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
    checkoutDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-manual-route-"));
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
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    questionStore.setJournalStore(journalStore);
    bootstrapProject(store, config, db);
    seedSkillsFromCatalog(skillStore, process.cwd().replace(/\/apps\/core$/, ""));
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
      undefined,
      journalStore,
      wikiStore,
      db,
    );
    return { app, store, pmStore, agentStore, journalStore, questionStore };
  }

  /** A leaf in a real project, owned by a seat the product provisions, with a running job. */
  function seedLeaf(f: ReturnType<typeof fixture>) {
    const checkout = mkdtempSync(join(tmpdir(), "kampaku-manual-checkout-"));
    checkoutDirs.push(checkout);
    const lead = f.agentStore.createSubAgent({
      slug: "cli-lead",
      name: "CLI lead",
      parentId: f.agentStore.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Own the CLI work order",
      systemPrompt: "Own the CLI work order",
    });
    const project = f.store.createProject({
      id: "project-1",
      slug: "cli",
      name: "CLI",
      status: "active",
      projectLeadAgentId: lead.id,
      repositories: [{ url: `file://${checkout}`, role: "core" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const now = new Date().toISOString();
    const jobId = "job-1";
    f.pmStore.createWorkItem({
      id: "leaf-1",
      projectId: project.id,
      title: "Statistics module",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: lead.id,
      jobId,
      acceptanceCriteria: [
        "`make check` exits 0 and its verbose output lists the new cases.",
        "A person who knows the product agrees the numbers look right.",
      ],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    f.store.createJob({
      id: jobId,
      taskId: "task-1",
      status: "leased",
      leaseId: "lease-1",
      capabilities: ["code.agent"],
      input: { repositoryPath: checkout },
    });
    return { project, jobId, lead };
  }

  /** The evidence a worker returns for the one check its criteria name. */
  function jobOutput() {
    return {
      summary: "Wrote the statistics module; `make check` exits 0.",
      iterations: 4,
      repositoryPath: "/tmp/checkout",
      requiredChecks: ["test"],
      checkResults: { test: true },
      filesChanged: ["src/textstats/stats.py"],
      evidence: [
        {
          subjectType: "behavior",
          format: "code",
          verificationMethod: "command",
          subject: "test",
          passed: true,
          verified: true,
          reference: "make check",
          observedAt: new Date().toISOString(),
          criterionId: "check:test",
          sourceTool: "run_check",
          output: '{"ok":true,"script":"test","command":"make check"}',
        },
      ],
    };
  }

  async function finishJob(f: ReturnType<typeof fixture>, jobId: string) {
    const response = await f.app.request(`/api/v1/jobs/${jobId}/result`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leaseId: "lease-1", status: "succeeded", output: jobOutput() }),
    });
    expect(response.status, "the job result is accepted").toBeLessThan(300);
  }

  it("raises the emperor's gate when a person's decision is the only thing missing", async () => {
    const f = fixture();
    seedLeaf(f);
    await finishJob(f, "job-1");

    expect(f.pmStore.getWorkItem("leaf-1")?.status, "the leaf is not closed on a tool's evidence alone").toBe(
      "blocked",
    );
    const questions = await f.app.request("/api/v1/questions?status=pending");
    const body = (await questions.json()) as { questions: Array<{ question: string; workItemId?: string; context?: string }> };
    expect(body.questions, "the missing decision was asked for, on the surface the operator reads").toHaveLength(1);
    expect(body.questions[0].question).toContain("manual-evidence:leaf-1:ac-2");
    expect(body.questions[0].context).toContain("A person who knows the product agrees the numbers look right.");
  });

  it("closes the leaf from the answer, without running the work a second time", async () => {
    const f = fixture();
    seedLeaf(f);
    await finishJob(f, "job-1");
    const pending = (await (await f.app.request("/api/v1/questions?status=pending")).json()) as {
      questions: Array<{ id: string }>;
    };

    const answered = await f.app.request(`/api/v1/questions/${pending.questions[0].id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "Accepted — the criterion is met" }),
    });
    expect(answered.status).toBeLessThan(300);

    expect(f.pmStore.getWorkItem("leaf-1")?.status, "the decision closed the work it was blocking").toBe("done");
    // Nothing was re-queued: the job that did the work is the evidence, and the answer filled the one hole.
    expect(f.store.getJob("job-1")?.status).toBe("succeeded");
  });

  it("keeps the leaf blocked when the decision refuses the criterion, and says so", async () => {
    const f = fixture();
    seedLeaf(f);
    await finishJob(f, "job-1");
    const pending = (await (await f.app.request("/api/v1/questions?status=pending")).json()) as {
      questions: Array<{ id: string }>;
    };

    await f.app.request(`/api/v1/questions/${pending.questions[0].id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "Rejected — the criterion is not met" }),
    });

    expect(f.pmStore.getWorkItem("leaf-1")?.status).toBe("blocked");
    const journal = f.journalStore.listForWorkItem("leaf-1");
    expect(journal.map((entry) => entry.kind)).toContain("evidence_review_resolved");
  });
});

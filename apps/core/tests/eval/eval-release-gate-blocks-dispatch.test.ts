import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { executeWorkItem } from "../../src/application/pm/execute-work-item.js";
import { createProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { createDb } from "../../src/persistence/db.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * **A pending gate stops dispatch.** Suite 05's own lock, for the box its second run left open.
 *
 * Run 2 of suite 05 (2026-10-19, `s05r3`) did the intake honestly — it read the checkout and staffed
 * four stations, each with a capability authored for that project — and then applied an eight-item plan
 * and asked one question: *"How should the intent-demo plan be released once you are satisfied with it?"*
 * That gate was still pending when the next prompt said `Start now`. **Two jobs were queued anyway**,
 * one succeeded, and `intent_demo/__main__.py` appeared in the fixture. The suite's oracle says no jobs
 * start from any prompt in it, so that run cannot score 10.
 *
 * Two holes made it possible, and neither is about the model's judgement:
 *
 * 1. `execute_work_item` — the tool a lead calls to release a leaf — never consulted
 *    `getProjectExecutionGate`. `playProject` and `stepProject` do, so the operator's own surfaces
 *    respected a pending gate while the seat dispatching the work did not.
 * 2. `countPendingByProject` skips a question with **no** project, and the intake turn asked the
 *    release decision in a conversation with no project attached. A gate nobody can attribute to a
 *    project was therefore invisible to every project's gate — the question existed, the operator could
 *    answer it, and dispatch saw nothing.
 *
 * Both are asserted here by attempting the dispatch, not by reading the gate's own answer: the
 * measured defect is that a rule existed on one path and not on the one that queues jobs.
 */

describe("a pending gate keeps the line stopped", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function createStores() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-release-gate-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const skillStore = new SkillStore(db);
    const journalStore = new JournalStore(db);
    questionStore.setBlockageStore(blockageStore);
    blockageStore.setQuestionStore(questionStore);
    return { store, pmStore, agentStore, questionStore, blockageStore, skillStore, journalStore, config };
  }

  function seedLeaf(
    deps: ReturnType<typeof createStores>,
    slug: string,
  ): { projectId: string; leafId: string } {
    const { store, pmStore, agentStore } = deps;
    const project = createProject(store, { slug, name: slug, status: "active" });
    const kampaku = agentStore.getKampakuAgent();
    const leafId = uuidv4();
    const now = new Date().toISOString();
    pmStore.createWorkItem({
      id: leafId,
      projectId: project.id,
      title: "First leaf",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      assigneeAgentId: kampaku.id,
      acceptanceCriteria: [],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: project.id, leafId };
  }

  function execute(deps: ReturnType<typeof createStores>, leafId: string) {
    const { store, pmStore, agentStore, skillStore, config, questionStore, blockageStore, journalStore } = deps;
    return executeWorkItem(
      { store, pmStore, agentStore, skillStore, config, questionStore, blockageStore, journalStore },
      leafId,
    );
  }

  it("refuses a leaf whose project holds a pending question", async () => {
    const deps = createStores();
    const { projectId, leafId } = seedLeaf(deps, "gated-scoped");
    deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: '<kampaku-question>{"id":"release-mode","type":"single_choice","prompt":"How should this plan be released?","options":["Hold","Step by step"],"required":true}</kampaku-question>',
      projectId,
    });

    await expect(execute(deps, leafId)).rejects.toThrow(/pending question/i);
    expect(deps.pmStore.getWorkItem(leafId)?.status).toBe("todo");
    expect(deps.pmStore.getWorkItem(leafId)?.jobId).toBeUndefined();
  });

  it("refuses a leaf when the pending question carries no project", async () => {
    // The measured shape: asked in a conversation with no project, about a project's release.
    const deps = createStores();
    const { leafId } = seedLeaf(deps, "gated-unscoped");
    deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: '<kampaku-question>{"id":"release-mode","type":"single_choice","prompt":"How should the plan be released once you are satisfied with it?","options":["Hold","Step by step"],"required":true}</kampaku-question>',
    });

    await expect(execute(deps, leafId)).rejects.toThrow(/pending question/i);
    expect(deps.pmStore.getWorkItem(leafId)?.status).toBe("todo");
  });

  it("dispatches once the gate is answered", async () => {
    // The control. A gate that stopped every dispatch would pass the two tests above and break the product.
    const deps = createStores();
    const { projectId, leafId } = seedLeaf(deps, "answered");
    const asked = deps.questionStore.askEmperor({
      askedByAgentId: "kampaku",
      question: '<kampaku-question>{"id":"release-mode","type":"single_choice","prompt":"How should this plan be released?","options":["Hold","Step by step"],"required":true}</kampaku-question>',
      projectId,
    });
    deps.questionStore.answer(asked.question.id, "Step by step");

    const result = await execute(deps, leafId);
    expect(result.workItemId).toBe(leafId);
    expect(deps.pmStore.getWorkItem(leafId)?.status).toBe("in_progress");
  });
});

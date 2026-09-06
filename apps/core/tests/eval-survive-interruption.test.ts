import { readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { recoverJobsAfterRestart } from "../src/application/jobs/startup-recovery.js";
import { runKampakuChat } from "../src/agents/runtime/session.js";
import { executeToolCall, type KampakuToolContext } from "../src/agents/runtime/tools/index.js";
import { createApp } from "../src/api/app.js";
import { bootstrapProject } from "../src/application/projects.js";
import { loadConfig } from "../src/config.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { ConversationStore } from "../src/persistence/conversation-store.js";
import { createDb } from "../src/persistence/db.js";
import { MemoryStore } from "../src/persistence/memory-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { QuestionStore } from "../src/persistence/question-store.js";
import { SkillStore } from "../src/persistence/skill-store.js";
import { Store } from "../src/persistence/store.js";

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Automated coverage for docs/eval/13-survive-interruption.md.
 */
describe("eval suite 13 survive interruption", () => {
  let dataDir: string;
  let strangerPath: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (strangerPath) rmSync(strangerPath, { recursive: true, force: true });
  });

  function createFreshInstance() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-eval-survive-"));
    strangerPath = join(tmpdir(), `kampaku-eval-survive-stranger-${Date.now()}`);
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: WORKSPACE_ROOT,
      agentMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    bootstrapProject(store, config, db);
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
    );
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      questionStore,
      config,
    };
    return { app, config, ctx, store, agentStore, pmStore };
  }

  async function bootstrapStranger(ctx: KampakuToolContext, agentStore: AgentStore) {
    const kampaku = agentStore.getKampakuAgent();
    await executeToolCall(
      ctx,
      "bootstrap_stranger_project",
      JSON.stringify({
        repository_path: strangerPath,
        project_slug: "eval-stranger",
        project_name: "Eval Stranger",
      }),
      { agentId: kampaku.id },
    );
  }

  it("cancel stops further controlled_batch writes", async () => {
    const { app, ctx, store, agentStore } = createFreshInstance();
    await bootstrapStranger(ctx, agentStore);
    const kampaku = agentStore.getKampakuAgent();

    const started = await executeToolCall(
      ctx,
      "start_durable_execution",
      JSON.stringify({
        project_slug_or_id: "eval-stranger",
        count: 80,
        delay_ms: 40,
        relative_dir: "interrupt-lab",
      }),
      { agentId: kampaku.id },
    );
    const { jobId } = started.output as { jobId: string };
    expect(store.getJob(jobId)?.status).toBe("running");

    await sleep(120);
    const cancelRes = await app.request(`/api/v1/jobs/${jobId}/cancel`, { method: "POST" });
    expect(cancelRes.status).toBe(200);
    await sleep(200);

    expect(store.getJob(jobId)?.status).toBe("cancelled");
    const dir = join(strangerPath, "interrupt-lab");
    const afterCancel = readdirSync(dir).filter((name) => name.endsWith(".txt")).length;
    await sleep(250);
    const later = readdirSync(dir).filter((name) => name.endsWith(".txt")).length;
    expect(later).toBe(afterCancel);
    expect(later).toBeGreaterThan(0);
    expect(later).toBeLessThan(80);

    const inspected = await executeToolCall(
      ctx,
      "inspect_execution_state",
      JSON.stringify({ job_id: jobId }),
      { agentId: kampaku.id },
    );
    const output = inspected.output as { jobStatus: string; terminal: boolean };
    expect(output.jobStatus).toBe("cancelled");
    expect(output.terminal).toBe(true);
  });

  it("restart recovery marks orphan running jobs expired (not still running)", async () => {
    const { ctx, store, agentStore, pmStore } = createFreshInstance();
    await bootstrapStranger(ctx, agentStore);
    const kampaku = agentStore.getKampakuAgent();

    const started = await executeToolCall(
      ctx,
      "start_durable_execution",
      JSON.stringify({
        project_slug_or_id: "eval-stranger",
        count: 200,
        delay_ms: 200,
        relative_dir: "interrupt-lab",
      }),
      { agentId: kampaku.id },
    );
    const { jobId } = started.output as { jobId: string };
    expect(store.getJob(jobId)?.status).toBe("running");

    // Simulate hard kill of the in-process runner without completing the job.
    const recovery = recoverJobsAfterRestart(store, pmStore);
    expect(recovery.orphanJobs).toBeGreaterThanOrEqual(1);
    expect(store.getJob(jobId)?.status).toBe("expired");

    const inspected = await executeToolCall(
      ctx,
      "inspect_execution_state",
      JSON.stringify({ job_id: jobId }),
      { agentId: kampaku.id },
    );
    const output = inspected.output as {
      jobStatus: string;
      lost: boolean;
      resumeAllowed: boolean;
      summary: string;
    };
    expect(output.jobStatus).toBe("expired");
    expect(output.lost).toBe(true);
    expect(output.resumeAllowed).toBe(false);
    expect(output.summary).toMatch(/expired|lost|not running/i);
  });

  it("stub chat starts durable work, inspects, and cancels", async () => {
    const { ctx, config, agentStore, store } = createFreshInstance();
    await bootstrapStranger(ctx, agentStore);

    const start = await runKampakuChat(
      ctx,
      config,
      "Start a long-running but safe task I can interrupt (for example generate many small files in the stranger project). Tell me when it is running.",
    );
    expect(start.toolsUsed).toEqual(
      expect.arrayContaining(["list_projects", "start_durable_execution"]),
    );
    expect(start.reply).toMatch(/Durable execution running/i);
    const jobId = start.reply.match(/`([0-9a-f-]{36})`/)?.[1];
    expect(jobId).toBeTruthy();
    expect(store.getJob(jobId!)?.status).toBe("running");

    await sleep(80);
    recoverJobsAfterRestart(ctx.store, ctx.pmStore);
    const inspect = await runKampakuChat(
      ctx,
      config,
      "What is the state of that work? Resume if safe, or tell me what was lost.",
    );
    expect(inspect.toolsUsed).toEqual(
      expect.arrayContaining(["list_projects", "inspect_execution_state"]),
    );
    expect(inspect.reply).toMatch(/expired|lost|not still running/i);

    // Fresh durable job for cancel path
    const start2 = await executeToolCall(
      ctx,
      "start_durable_execution",
      JSON.stringify({
        project_slug_or_id: "eval-stranger",
        count: 50,
        delay_ms: 40,
        relative_dir: "interrupt-lab-2",
      }),
      { agentId: agentStore.getKampakuAgent().id },
    );
    const job2 = (start2.output as { jobId: string }).jobId;
    await sleep(60);
    const cancel = await runKampakuChat(
      ctx,
      config,
      `Cancel that work for real and confirm nothing new is written after cancel. Job ${job2}`,
    );
    expect(cancel.toolsUsed).toContain("cancel_execution");
    expect(cancel.reply).toMatch(/cancelled/i);
    expect(store.getJob(job2)?.status).toBe("cancelled");
  });
});

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { Store } from "../../src/persistence/store.js";
import { CoreClient } from "../../src/client/core-client.js";
import { sendKampakuMessage } from "../../src/cli/agents-output.js";

/**
 * `kampaku chat --project-id <id>` scopes the conversation it opens.
 *
 * Measured 2026-09-25 in the suite-05 run: the flag was parsed, passed into the chat session, and then
 * **dropped** by `sendKampakuMessage`, whose options type named only `conversationId`. Both conversations
 * opened with `--project-id` recorded `projectId: null`, so the durable-state block told the model *"this
 * conversation is not scoped to a project"* on the project the operator had just named — and the turn asked
 * which project it meant (BOARD F-047).
 *
 * Driven through the real `CoreClient` against a real app rather than against a mock, because the defect was
 * a flag that survived two layers and died in a third: a test that stubs the client would have caught
 * nothing.
 */
describe("eval 05 — a CLI turn carries the project it was scoped to", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-cli-scope-"));
    dataDir = root;
    const workspaceRoot = join(root, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });

    // `stub` agent mode: this test is about the request the CLI sends, not about a model's reply.
    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot,
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const now = new Date().toISOString();
    const project = store.createProject({
      id: "77777777-7777-4777-8777-777777777777",
      slug: "intent-demo",
      name: "Intent Demo",
      status: "planning",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });

    const { createApp } = await import("../../src/api/app.js");
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      new ConversationStore(db),
      new SkillStore(db),
      questionStore,
      new MemoryStore(db),
      blockageStore,
      journalStore,
      undefined,
      undefined,
      undefined,
      new RefusalStore(db),
    );
    const client = new CoreClient({
      baseUrl: "http://test",
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        app.request(
          (typeof input === "string" ? input : input.toString()).replace("http://test", ""),
          init,
        )) as typeof fetch,
    });
    return { app, client, project, config, store, pmStore, agentStore };
  }

  it("records the conversation against the project the operator named", async () => {
    const { app, client, project } = await setup();

    const conversationId = await sendKampakuMessage(client, "Improve the project.", {
      projectId: project.id,
    });

    const body = (await (
      await app.request(`/api/v1/conversations/${conversationId}`)
    ).json()) as { conversation: { projectId: string | null } };
    expect(body.conversation.projectId).toBe(project.id);
  });

  it("leaves the conversation unscoped when no project was named", async () => {
    const { app, client } = await setup();

    const conversationId = await sendKampakuMessage(client, "What exists?");

    const body = (await (
      await app.request(`/api/v1/conversations/${conversationId}`)
    ).json()) as { conversation: { projectId: string | null } };
    // The control. A conversation with no project is still a conversation, and the block says so — which is
    // the behaviour F-041 introduced and this change must not disturb.
    expect(body.conversation.projectId).toBeNull();
  });
});

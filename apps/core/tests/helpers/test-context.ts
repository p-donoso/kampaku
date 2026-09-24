import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type AppConfig } from "../../src/config.js";
import { createDb, type Db, type DatabaseConnection } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import { PostActionReviewStore } from "../../src/persistence/post-action-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import {
  buildPostActionRuntime,
  type PostActionRuntime,
} from "../../src/application/pm/post-action/index.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * Standard test environment instance containing initialized stores and cleanup callback.
 */
export interface TestContext {
  /** Temporary filesystem directory. */
  dataDir: string;
  /** Resolved application configuration. */
  config: AppConfig;
  /** SQLite database instance and connection handle. */
  dbConn: DatabaseConnection;
  /** Drizzle database client. */
  db: Db;
  /** Legacy platform store. */
  store: Store;
  /** Agent repository store. */
  agentStore: AgentStore;
  /** Conversation message store. */
  conversationStore: ConversationStore;
  /** Project management and work items store. */
  pmStore: PmStore;
  /** Skill catalog store. */
  skillStore: SkillStore;
  /** Specialist agent memory store. */
  memoryStore: MemoryStore;
  /** Escalated questions store. */
  questionStore: QuestionStore;
  /** Blocker tracking store. */
  blockageStore: BlockageStore;
  /** Work item operational journal store. */
  journalStore: JournalStore;
  /** Wiki documentation store. */
  wikiStore: WikiStore;
  /** Post-action review store. */
  postActionStore: PostActionReviewStore;
  /** Durable record of out-of-scope refusals. */
  refusalStore: RefusalStore;
  /** Post-action review runtime wired to every store. */
  postActionRuntime: PostActionRuntime;
  /** Kampaku runtime tool context. */
  toolContext: KampakuToolContext;
  /** Cleans up temporary files and closes database connection. */
  cleanup: () => void;
}

/**
 * Factory for creating an isolated test environment with fresh temp directory and database.
 * @param prefix - Prefix used for temporary directory name.
 * @param configOverrides - Custom configuration overrides.
 * @returns Fully initialized TestContext.
 */
export function createTestContext(
  prefix = "kampaku-test-",
  configOverrides: Partial<Parameters<typeof loadConfig>[0]> = {},
): TestContext {
  const dataDir = mkdtempSync(join(tmpdir(), prefix));
  const config = loadConfig({
    dataDir,
    dbPath: join(dataDir, "kampaku.db"),
    workspaceRoot: join(dataDir, "workspace"),
    agentMode: "stub",
    plannerMode: "stub",
    ...configOverrides,
  });

  const dbConn = createDb(config.dbPath);
  const db = dbConn.db;

  const store = new Store(db);
  const agentStore = new AgentStore(db);
  const conversationStore = new ConversationStore(db);
  const pmStore = new PmStore(db);
  const skillStore = new SkillStore(db);
  const memoryStore = new MemoryStore(db);
  const journalStore = new JournalStore(db, pmStore);
  const questionStore = new QuestionStore(db, agentStore, pmStore);
  const blockageStore = new BlockageStore(db, agentStore, pmStore);
  const wikiStore = new WikiStore(db);
  const postActionStore = new PostActionReviewStore(db, pmStore);
  const refusalStore = new RefusalStore(db);

  questionStore.setBlockageStore(blockageStore);
  questionStore.setJournalStore(journalStore);
  blockageStore.setQuestionStore(questionStore);
  blockageStore.setJournalStore(journalStore);

  const toolContext: KampakuToolContext = {
    store,
    agentStore,
    conversationStore,
    pmStore,
    skillStore,
    memoryStore,
    questionStore,
    blockageStore,
    journalStore,
    wikiStore,
    config,
    postActionStore,
    refusalStore,
  };

  const postActionRuntime = buildPostActionRuntime({
    pmStore,
    agentStore,
    reviewStore: postActionStore,
    store,
    journalStore,
    memoryStore,
    wikiStore,
  })!;

  const cleanup = () => {
    try {
      dbConn.close();
    } catch {
      // Ignore database close errors in test cleanup.
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error if already removed.
    }
  };

  return {
    dataDir,
    config,
    dbConn,
    db,
    store,
    agentStore,
    conversationStore,
    pmStore,
    skillStore,
    memoryStore,
    questionStore,
    blockageStore,
    journalStore,
    wikiStore,
    postActionStore,
    refusalStore,
    postActionRuntime,
    toolContext,
    cleanup,
  };
}

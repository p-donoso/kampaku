import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig, type AppConfig } from "../config.js";
import { CoreClient } from "../client/core-client.js";
import { createDb } from "../persistence/db.js";
import { AgentStore } from "../persistence/agent-store.js";
import { ConversationStore } from "../persistence/conversation-store.js";
import { PmStore } from "../persistence/pm-store.js";
import { SkillStore } from "../persistence/skill-store.js";
import { QuestionStore } from "../persistence/question-store.js";
import { BlockageStore } from "../persistence/blockage-store.js";
import { MemoryStore } from "../persistence/memory-store.js";
import { JournalStore } from "../persistence/journal-store.js";
import { WikiStore } from "../persistence/wiki-store.js";
import { PostActionReviewStore } from "../persistence/post-action-store.js";
import { Store } from "../persistence/store.js";
import type { KampakuToolContext } from "../agents/runtime/tools/index.js";

export function detectWorkspaceRoot(): string {
  if (process.env.KAMPAKU_WORKSPACE) {
    return process.env.KAMPAKU_WORKSPACE;
  }

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(join(dir, "apps/core")) &&
      existsSync(join(dir, "apps/worker"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return join(process.cwd(), "..");
}

export function loadWorkspaceEnv(workspaceRoot = detectWorkspaceRoot()): void {
  process.env.KAMPAKU_WORKSPACE ??= workspaceRoot;
  loadEnvFile(join(workspaceRoot, ".env"));
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env.KAMPAKU_DOTENV_OVERRIDE === "0" && process.env[key] !== undefined) {
      continue;
    }

    // Workspace configuration is authoritative by default. Eval and CI runs
    // may preserve explicit process values with KAMPAKU_DOTENV_OVERRIDE=0.
    if (key.startsWith("KAMPAKU_") || key.startsWith("FREELLMAPI_")) {
      process.env[key] = value;
    }
  }
}

export function createAppContext() {
  loadWorkspaceEnv();
  const config = loadConfig();
  return { config };
}

export function createStoreContext(configOverride?: AppConfig) {
  const config = configOverride ?? createAppContext().config;
  const { db } = createDb(config.dbPath);
  const store = new Store(db);
  const agentStore = new AgentStore(db);
  const conversationStore = new ConversationStore(db);
  const pmStore = new PmStore(db);
  const skillStore = new SkillStore(db);
  const questionStore = new QuestionStore(db, agentStore, pmStore);
  const blockageStore = new BlockageStore(db, agentStore, pmStore);
  const journalStore = new JournalStore(db, pmStore);
  const wikiStore = new WikiStore(db);
  questionStore.setBlockageStore(blockageStore);
  questionStore.setJournalStore(journalStore);
  blockageStore.setQuestionStore(questionStore);
  blockageStore.setJournalStore(journalStore);
  const memoryStore = new MemoryStore(db);
  const postActionStore = new PostActionReviewStore(db, pmStore);
  return { config, store, agentStore, conversationStore, pmStore, skillStore, questionStore, blockageStore, journalStore, wikiStore, memoryStore, postActionStore, db };
}

export function createToolContext(): KampakuToolContext {
  const { config, store, agentStore, conversationStore, pmStore, skillStore, questionStore, blockageStore, journalStore, wikiStore, memoryStore, postActionStore } =
    createStoreContext();
  return { config, store, agentStore, conversationStore, pmStore, skillStore, questionStore, blockageStore, journalStore, wikiStore, memoryStore, postActionStore };
}

/**
 * Default client timeout: 30 minutes.
 *
 * Deliberately generous. A Kampaku chat turn runs a model loop with tool calls, and on a large
 * reasoning model it can take many minutes; the runtime's own default headers timeout is far
 * shorter, so leaving this unset made long turns impossible to complete from the CLI — the
 * client aborted while Core kept working, losing the turn's record but not its side effects.
 */
const DEFAULT_CORE_CLIENT_TIMEOUT_MS = 30 * 60 * 1000;

export function createCoreClient(config: AppConfig): CoreClient {
  const configured = Number(process.env.KAMPAKU_CLIENT_TIMEOUT_MS ?? "");
  return new CoreClient({
    baseUrl: config.coreUrl,
    timeoutMs: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CORE_CLIENT_TIMEOUT_MS,
  });
}

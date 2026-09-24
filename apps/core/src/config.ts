import { homedir } from "node:os";
import { join } from "node:path";

export type RepositoryRole = "core" | "worker" | "contracts" | "docs" | "web";
export type PlannerMode = "llm" | "stub";
export type AgentMode = "llm" | "stub";

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  coreHost: string;
  corePort: number;
  coreUrl: string;
  workspaceRoot: string;
  /** Provider-neutral OpenAI-compatible endpoint configuration. */
  modelBaseUrl?: string;
  modelApiKey?: string;
  /**
   * The endpoint's effective context window, in tokens.
   *
   * Optional, and worth setting: without it the broker still detects a truncated turn after the fact
   * and learns the cap from it, but it cannot refuse an overflowing turn before sending it. A hosted
   * model's window is a documented number, so an operator who knows it gets the cheap protection.
   */
  modelContextTokens?: number;
  /** Tokens held back for the reply when checking whether a turn fits. */
  modelReplyReserveTokens?: number;
  /** @deprecated Compatibility fields for the optional FreeLLMAPI router. */
  freellmapiBaseUrl?: string;
  /** @deprecated Compatibility fields for the optional FreeLLMAPI router. */
  freellmapiApiKey?: string;
  plannerMode: PlannerMode;
  plannerModel: string;
  agentMode: AgentMode;
  agentModel: string;
  leaseDurationMs: number;
  webPort: number;
}

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

/** An unset or nonsensical limit must read as "unknown", never as zero. */
function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = expandHome(process.env.KAMPAKU_DATA_DIR ?? "~/.kampaku");
  const coreHost = process.env.KAMPAKU_CORE_HOST ?? "127.0.0.1";
  const corePort = Number(process.env.KAMPAKU_CORE_PORT ?? "8080");

  return {
    dataDir,
    dbPath: join(dataDir, "kampaku.db"),
    coreHost,
    corePort,
    coreUrl: process.env.KAMPAKU_CORE_URL ?? `http://${coreHost}:${corePort}`,
    workspaceRoot: process.env.KAMPAKU_WORKSPACE ?? join(process.cwd(), ".."),
    modelBaseUrl: process.env.KAMPAKU_MODEL_BASE_URL ?? process.env.FREELLMAPI_BASE_URL ?? "http://localhost:3001/v1",
    modelApiKey: process.env.KAMPAKU_MODEL_API_KEY ?? process.env.FREELLMAPI_API_KEY,
    modelContextTokens: positiveInt(process.env.KAMPAKU_MODEL_CONTEXT_TOKENS),
    modelReplyReserveTokens: positiveInt(process.env.KAMPAKU_MODEL_REPLY_RESERVE_TOKENS),
    plannerMode: (process.env.KAMPAKU_PLANNER as PlannerMode) ?? "llm",
    plannerModel: process.env.KAMPAKU_PLANNER_MODEL ?? "auto",
    agentMode: (process.env.KAMPAKU_AGENT as AgentMode) ?? "stub",
    agentModel: process.env.KAMPAKU_AGENT_MODEL ?? "auto",
    leaseDurationMs: Number(process.env.KAMPAKU_LEASE_DURATION_MS ?? `${30 * 60 * 1000}`),
    webPort: Number(process.env.KAMPAKU_WEB_PORT ?? "3002"),
    ...overrides,
  };
}

export const REPOSITORY_ROLE_DIRS: Record<RepositoryRole, string> = {
  core: "apps/core",
  worker: "apps/worker",
  contracts: "packages/contracts",
  docs: "docs",
  web: "apps/web",
};

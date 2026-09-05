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
  freellmapiBaseUrl: string;
  freellmapiApiKey: string | undefined;
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
    freellmapiBaseUrl:
      process.env.FREELLMAPI_BASE_URL ?? "http://localhost:3001/v1",
    freellmapiApiKey: process.env.FREELLMAPI_API_KEY,
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

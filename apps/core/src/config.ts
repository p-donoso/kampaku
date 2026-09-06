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

/** Treat missing or blank env values as unset so `.env.example` placeholders do not break boot. */
function envOrUndefined(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = expandHome(envOrUndefined("KAMPAKU_DATA_DIR") ?? "~/.kampaku");
  const coreHost = envOrUndefined("KAMPAKU_CORE_HOST") ?? "127.0.0.1";
  const corePort = Number(envOrUndefined("KAMPAKU_CORE_PORT") ?? "8080");

  return {
    dataDir,
    dbPath: join(dataDir, "kampaku.db"),
    coreHost,
    corePort,
    coreUrl: envOrUndefined("KAMPAKU_CORE_URL") ?? `http://${coreHost}:${corePort}`,
    workspaceRoot: envOrUndefined("KAMPAKU_WORKSPACE") ?? join(process.cwd(), ".."),
    freellmapiBaseUrl:
      envOrUndefined("FREELLMAPI_BASE_URL") ?? "http://localhost:3001/v1",
    freellmapiApiKey: envOrUndefined("FREELLMAPI_API_KEY"),
    plannerMode: (envOrUndefined("KAMPAKU_PLANNER") as PlannerMode | undefined) ?? "llm",
    plannerModel: envOrUndefined("KAMPAKU_PLANNER_MODEL") ?? "auto",
    agentMode: (envOrUndefined("KAMPAKU_AGENT") as AgentMode | undefined) ?? "stub",
    agentModel: envOrUndefined("KAMPAKU_AGENT_MODEL") ?? "auto",
    leaseDurationMs: Number(envOrUndefined("KAMPAKU_LEASE_DURATION_MS") ?? `${30 * 60 * 1000}`),
    webPort: Number(envOrUndefined("KAMPAKU_WEB_PORT") ?? "3002"),
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

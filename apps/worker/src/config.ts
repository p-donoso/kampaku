import { join } from "node:path";

export type RepositoryRole = "core" | "worker" | "contracts" | "docs" | "web";
export type ExecutorMode = "echo" | "freellmapi";

export interface WorkerConfig {
  coreUrl: string;
  workerId: string;
  workerName: string;
  workspaceRoot: string;
  executorMode: ExecutorMode;
  freellmapiBaseUrl: string;
  freellmapiApiKey?: string;
  agentModel: string;
  pollIntervalMs: number;
  freellmapiInitialTimeoutMs: number;
  freellmapiInitialRetries: number;
}

export const REPOSITORY_DIRS: Record<RepositoryRole, string> = {
  core: "apps/core",
  worker: "apps/worker",
  contracts: "packages/contracts",
  docs: "docs",
  web: "apps/web",
};

function parseExecutorMode(value: string | undefined): ExecutorMode {
  const mode = value ?? "freellmapi";
  if (mode !== "freellmapi" && mode !== "echo") {
    throw new Error(`Invalid KAMPAKU_EXECUTOR: ${mode}. Expected "freellmapi" or "echo".`);
  }
  return mode;
}

export function loadWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): WorkerConfig {
  return {
    coreUrl: env.KAMPAKU_CORE_URL ?? "http://127.0.0.1:8080",
    workerId: env.KAMPAKU_WORKER_ID ?? "00000000-0000-4000-8000-000000000001",
    workerName: env.KAMPAKU_WORKER_NAME ?? "local-worker",
    workspaceRoot: env.KAMPAKU_WORKSPACE ?? join(cwd, ".."),
    executorMode: parseExecutorMode(env.KAMPAKU_EXECUTOR),
    freellmapiBaseUrl: env.FREELLMAPI_BASE_URL ?? "http://localhost:3001/v1",
    freellmapiApiKey: env.FREELLMAPI_API_KEY,
    agentModel: env.KAMPAKU_WORKER_MODEL ?? "auto",
    pollIntervalMs: Number(env.KAMPAKU_POLL_INTERVAL_MS ?? "2000"),
    freellmapiInitialTimeoutMs: Number(env.KAMPAKU_FREELLMAPI_INITIAL_TIMEOUT_MS ?? "120000"),
    freellmapiInitialRetries: Number(env.KAMPAKU_FREELLMAPI_INITIAL_RETRIES ?? "3"),
  };
}

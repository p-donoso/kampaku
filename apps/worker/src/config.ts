/**
 * @module config
 * Configuration loader and environment bindings for the Kampaku Worker execution runtime.
 */

import { join } from "node:path";

/**
 * Recognized monorepo repository roles for targeting execution checkouts.
 */
export type RepositoryRole = "core" | "worker" | "contracts" | "docs" | "web";

/**
 * Supported execution modes for worker job processing.
 */
export type ExecutorMode = "echo" | "freellmapi";

/**
 * Strongly typed configuration options required to run a worker node.
 */
export interface WorkerConfig {
  /** Base URL for Kampaku Core HTTP API (e.g. `http://127.0.0.1:8080`) */
  coreUrl: string;
  /** Unique UUID identifying this worker registration */
  workerId: string;
  /** Human-readable display name for this worker */
  workerName: string;
  /** Root directory of the local workspace checkout containing repository folders */
  workspaceRoot: string;
  /** Primary executor driver (`freellmapi` for coding agents, `echo` for dry-run tests) */
  executorMode: ExecutorMode;
  /** Base URL for FreeLLMAPI or OpenAI-compatible endpoint */
  freellmapiBaseUrl: string;
  /** Authentication API key for FreeLLMAPI */
  freellmapiApiKey?: string;
  /** Model name or alias to route task completion prompts */
  agentModel: string;
  /** Polling interval in milliseconds when waiting for new leased jobs */
  pollIntervalMs: number;
  /** Initial response timeout in milliseconds before retrying connection to LLM */
  freellmapiInitialTimeoutMs: number;
  /** Number of initial retry attempts allowed when connecting to LLM */
  freellmapiInitialRetries: number;
}

/**
 * Mapping of repository roles to their relative subdirectories in the monorepo.
 */
export const REPOSITORY_DIRS: Record<RepositoryRole, string> = {
  core: "apps/core",
  worker: "apps/worker",
  contracts: "packages/contracts",
  docs: "docs",
  web: "apps/web",
};

/**
 * Parses and validates the executor mode string.
 *
 * @param value - Value from `KAMPAKU_EXECUTOR` environment variable.
 * @returns Validated `ExecutorMode`.
 * @throws If the value is neither "freellmapi" nor "echo".
 */
function parseExecutorMode(value: string | undefined): ExecutorMode {
  const mode = value ?? "freellmapi";
  if (mode !== "freellmapi" && mode !== "echo") {
    throw new Error(`Invalid KAMPAKU_EXECUTOR: ${mode}. Expected "freellmapi" or "echo".`);
  }
  return mode;
}

/**
 * Loads and validates the worker configuration from environment variables and working directory.
 *
 * @param env - Process environment dictionary (defaults to `process.env`).
 * @param cwd - Current working directory path (defaults to `process.cwd()`).
 * @returns Complete `WorkerConfig` object.
 */
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

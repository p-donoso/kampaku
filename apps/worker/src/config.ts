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
export type ExecutorMode = "echo" | "openai-compatible";

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
  /** Primary executor driver (`openai-compatible` for model-backed coding agents, `echo` for dry-run tests) */
  executorMode: ExecutorMode;
  /** Base URL for any OpenAI-compatible model endpoint. */
  /**
   * No default host, matching the core contract. Undefined means unset, and the executor reports the
   * missing setting rather than dialling a port the operator never named.
   */
  modelBaseUrl?: string;
  /** Authentication API key for the configured model endpoint. */
  modelApiKey?: string;
  /** Model name or alias to route task completion prompts */
  agentModel: string;
  /** Polling interval in milliseconds when waiting for new leased jobs */
  pollIntervalMs: number;
  /** Initial response timeout in milliseconds before retrying connection to LLM */
  modelInitialTimeoutMs: number;
  /** Number of initial retry attempts allowed when connecting to LLM */
  modelInitialRetries: number;
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
 *
 * A vendor-prefixed alias was accepted here for one release window; it is gone, per roadmap 11 § Part A's
 * clean-break decision. The value names what the executor does, not who provides it.
 */
function parseExecutorMode(value: string | undefined): ExecutorMode {
  const mode = value ?? "openai-compatible";
  if (mode !== "openai-compatible" && mode !== "echo") {
    throw new Error(`Invalid KAMPAKU_EXECUTOR: ${mode}. Expected "openai-compatible" or "echo".`);
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
    modelBaseUrl: env.KAMPAKU_MODEL_BASE_URL,
    modelApiKey: env.KAMPAKU_MODEL_API_KEY,
    agentModel: env.KAMPAKU_WORKER_MODEL ?? "auto",
    pollIntervalMs: Number(env.KAMPAKU_POLL_INTERVAL_MS ?? "2000"),
    modelInitialTimeoutMs: Number(env.KAMPAKU_MODEL_INITIAL_TIMEOUT_MS ?? "120000"),
    modelInitialRetries: Number(env.KAMPAKU_MODEL_INITIAL_RETRIES ?? "3"),
  };
}

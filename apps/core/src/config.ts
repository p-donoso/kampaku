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
  /**
   * The documented endpoint contract, and the only one.
   *
   * ```text
   * KAMPAKU_MODEL_BASE_URL           an OpenAI-compatible base URL, ending in /v1
   * KAMPAKU_MODEL_API_KEY            the key for it, if it needs one
   * KAMPAKU_MODEL_INITIAL_TIMEOUT_MS how long a first attempt may take
   * KAMPAKU_MODEL_INITIAL_RETRIES    how many times a first attempt is retried
   * KAMPAKU_EXECUTOR                 openai-compatible | echo
   * ```
   *
   * **No default host.** These were `KAMPAKU_MODEL_*` with `KAMPAKU_MODEL_*` fallbacks and an implicit
   * `http://localhost:3001/v1`, which meant a missing setting produced a silent connection attempt to a
   * port the operator never named. A missing base URL is now a failure with a message, at the point the
   * model is actually needed — see `createModelBroker`.
   */
  modelBaseUrl?: string;
  modelApiKey?: string;
  /** How long a first model attempt may take, before any retry. */
  modelInitialTimeoutMs: number;
  /** How many times a first model attempt is retried before the turn fails. */
  modelInitialRetries: number;
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
  /**
   * How long one operator turn may spend before it stops and says so.
   *
   * Optional with a default, and the default exists because of a measurement: on 2026-09-25 a
   * `kampaku chat -m` turn ran **40 minutes**, made a model call every 30–120 s, created nothing, and
   * was still looping when Core was stopped; the next one ran **911 s** and never returned a reply at
   * all (BOARD F-048). The loop was bounded per session at 10 iterations, but one front-office turn
   * can nest `delegate_to_agent` sessions, each with its own 10, so a single turn could reach ~100
   * model calls with nothing on the operator's side but a client timeout that fires while Core keeps
   * working.
   *
   * The budget is a **wall clock shared by the whole turn**, including delegated sessions, because
   * that is the unit an operator experiences and the one the runaway broke. When it is reached the
   * turn stops and reports the fact rather than failing silently: see `budgetExhausted`.
   */
  turnBudgetMs: number;
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
  // The default comes from the declared local port block (scripts/ports.env, docs/development/local-ports.md),
  // so the stack does not claim a port another local service already holds.
  const corePort = Number(process.env.KAMPAKU_CORE_PORT ?? "28080");

  return {
    dataDir,
    dbPath: join(dataDir, "kampaku.db"),
    coreHost,
    corePort,
    coreUrl: process.env.KAMPAKU_CORE_URL ?? `http://${coreHost}:${corePort}`,
    workspaceRoot: process.env.KAMPAKU_WORKSPACE ?? join(process.cwd(), ".."),
    modelBaseUrl: process.env.KAMPAKU_MODEL_BASE_URL,
    modelApiKey: process.env.KAMPAKU_MODEL_API_KEY,
    // The documented names were already the preferred ones here; the vendor-prefixed fallbacks are what
    // this change removes, so the contract has one spelling rather than two.
    modelInitialTimeoutMs: Number(process.env.KAMPAKU_MODEL_INITIAL_TIMEOUT_MS ?? "120000"),
    modelInitialRetries: Number(process.env.KAMPAKU_MODEL_INITIAL_RETRIES ?? "3"),
    modelContextTokens: positiveInt(process.env.KAMPAKU_MODEL_CONTEXT_TOKENS),
    modelReplyReserveTokens: positiveInt(process.env.KAMPAKU_MODEL_REPLY_RESERVE_TOKENS),
    // Five minutes. Suite 04's five live turns averaged ~90 s each on a healthy endpoint, so this
    // leaves room for a turn that genuinely works while cutting the measured runaway by 8×.
    turnBudgetMs: positiveInt(process.env.KAMPAKU_TURN_BUDGET_MS) ?? 300_000,
    plannerMode: (process.env.KAMPAKU_PLANNER as PlannerMode) ?? "llm",
    plannerModel: process.env.KAMPAKU_PLANNER_MODEL ?? "auto",
    agentMode: (process.env.KAMPAKU_AGENT as AgentMode) ?? "stub",
    agentModel: process.env.KAMPAKU_AGENT_MODEL ?? "auto",
    leaseDurationMs: Number(process.env.KAMPAKU_LEASE_DURATION_MS ?? `${30 * 60 * 1000}`),
    webPort: Number(process.env.KAMPAKU_WEB_PORT ?? "28002"),
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

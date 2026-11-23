import { homedir } from "node:os";
import { join } from "node:path";
import type { ReasoningEffort } from "./model-broker/types.js";

export type RepositoryRole = "core" | "worker" | "contracts" | "docs" | "web";
export type PlannerMode = "llm" | "stub";
export type AgentMode = "llm" | "stub";

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  coreHost: string;
  corePort: number;
  coreUrl: string;
  /**
   * The platform checkout: `apps/`, `packages/`, `docs/`.
   *
   * This is the **isolation boundary**, not a work area. A project repository is refused for being inside
   * it, and `bootstrap` reads the skill catalog from it. `projectsDir` below is the folder projects live
   * in; the two are separate settings because they mean opposite things.
   */
  workspaceRoot: string;
  /**
   * Where the work lives: the folder project checkouts belong in.
   *
   * `~/kampaku-projects` by default. This is the operator's answer to "where does the factory work?" —
   * before it existed the answer was wherever a model typed a path, which on this operator's machine meant
   * a directory per project directly in `/home/pdonoso`, mixed in with everything else he keeps there.
   *
   * It is **named to the agents**, so a path proposed for a new project is `<projectsDir>/<slug>` rather
   * than whatever absolute path a model improvises, and it is added to the allowed folders. It does not
   * make `create_project` accept a path that does not exist: a checkout is still named before it is linked
   * (`allowMissingPath` stays off there), so this setting decides *where* the work goes, not whether the
   * product invents directories.
   *
   * Created by `kampaku bootstrap` and `kampaku serve` — the operator's own startup paths — rather than by
   * anything that merely loads a config, so a test or an embedded caller leaves no directory behind.
   */
  projectsDir: string;
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
   * A second documented surface sits beside it and does not contradict it: the reasoning budget, per role,
   * in `plannerReasoningEffort` and `agentReasoningEffort` below.
   *
   * **No default host.** These were `KAMPAKU_MODEL_*` with `KAMPAKU_MODEL_*` fallbacks and an implicit
   * `http://localhost:3001/v1`, which meant a missing setting produced a silent connection attempt to a
   * port the operator never named. A missing base URL is now a failure with a message, at the point the
   * model is actually needed — see `createModelBroker`.
   */
  modelBaseUrl?: string;
  modelApiKey?: string;
  /**
   * The values the **environment** states, which is not the same as the values in force.
   *
   * `modelBaseUrl` / `agentModel` above carry the effective value, which may have been filled from stored
   * settings. These three carry only what the operator wrote, so the settings surface can say which of the two
   * places won — and so a value the product defaulted (`KAMPAKU_AGENT_MODEL=auto`) is not mistaken for an
   * instruction. That distinction is BOARD F-026: stored settings used to outrank the environment silently.
   */
  modelBaseUrlPinned?: string;
  modelApiKeyPinned?: string;
  agentModelPinned?: string;
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
  /**
   * The reasoning budget for calls that **decide what to do**: planning, decomposition, expansion.
   *
   * `high` by default, and it is the one place this project deliberately spends: a plan that is wrong is
   * paid for again by every attempt that follows it. Rationale and the measurements behind the two
   * defaults: `docs/concepts/token-economy.md`.
   */
  plannerReasoningEffort?: ReasoningEffort;
  agentMode: AgentMode;
  agentModel: string;
  /**
   * The reasoning budget for calls that **do the work**: tool loops, sub-agent turns, summaries.
   *
   * `low` by default. Execution is mostly reading, calling, and writing what the plan already said, and a
   * long reasoning pass there buys latency and output tokens rather than decisions.
   */
  agentReasoningEffort?: ReasoningEffort;
  leaseDurationMs: number;
  webPort: number;
}

export const DEFAULT_PROJECTS_DIR = "~/kampaku-projects";

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

/** An unset or nonsensical limit must read as "unknown", never as zero. */
function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

/**
 * The words that mean "ask the endpoint for nothing".
 *
 * `off` is the one an operator needs, because an endpoint that refuses the parameter cannot be talked out
 * of it; the others exist because a disabled setting reads differently to different people. Anything else,
 * **including a word no endpoint knows**, is passed through: the request is the place a vocabulary
 * mismatch is decided, and a value silently swallowed here is a setting that appears to do nothing.
 */
const NO_REASONING_EFFORT = /^(off|none|false|0)$/i;

/**
 * A reasoning budget from the environment, with its role's default.
 *
 * An empty value is unset rather than explicit, so a blank line in `.env` takes the default instead of
 * quietly turning the budget off.
 */
function reasoningEffort(value: string | undefined, fallback: string): ReasoningEffort | undefined {
  const raw = value?.trim() ?? "";
  if (raw === "") return NO_REASONING_EFFORT.test(fallback) ? undefined : fallback;
  return NO_REASONING_EFFORT.test(raw) ? undefined : raw;
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
    // An empty value is unset rather than a projects folder at the filesystem root.
    projectsDir: expandHome(process.env.KAMPAKU_PROJECTS_DIR?.trim() || DEFAULT_PROJECTS_DIR),
    modelBaseUrl: process.env.KAMPAKU_MODEL_BASE_URL,
    modelApiKey: process.env.KAMPAKU_MODEL_API_KEY,
    // Only what the environment states. An empty value is unset, so a blank line in `.env` cannot pin anything.
    modelBaseUrlPinned: process.env.KAMPAKU_MODEL_BASE_URL?.trim() || undefined,
    modelApiKeyPinned: process.env.KAMPAKU_MODEL_API_KEY?.trim() || undefined,
    agentModelPinned: process.env.KAMPAKU_AGENT_MODEL?.trim() || undefined,
    // The documented names were already the preferred ones here; the vendor-prefixed fallbacks are what
    // this change removes, so the contract has one spelling rather than two.
    modelInitialTimeoutMs: Number(process.env.KAMPAKU_MODEL_INITIAL_TIMEOUT_MS ?? "120000"),
    modelInitialRetries: Number(process.env.KAMPAKU_MODEL_INITIAL_RETRIES ?? "3"),
    modelContextTokens: positiveInt(process.env.KAMPAKU_MODEL_CONTEXT_TOKENS),
    modelReplyReserveTokens: positiveInt(process.env.KAMPAKU_MODEL_REPLY_RESERVE_TOKENS),
    // Fifteen minutes, and the number is a measurement rather than a taste.
    //
    // It was 300_000 (five minutes), chosen by suite 05's fix as a ceiling against a measured 40-minute
    // runaway. Suite 07 then spent eleven runs discovering that the work the product *instructs* does not fit
    // in it: a front-office planning turn delegates **one** tool call, and the delegation reads the checkout,
    // previews a plan, approves it and applies it. Run 19 took the measurement the row asked for — fresh data
    // dir, shipped default, no override — and the turn **stopped at 5.1 of 5.0 minutes**, 291 s of it inside
    // that one delegation, with the plan applied and eight work items durable (BOARD F-058). A bound that stops
    // the turn after the work succeeded is a bound that costs the operator the result and gives back an
    // apology.
    //
    // Fifteen minutes is ~3× the measured need and still 4× under run 16's 60-minute turn, which produced no
    // plan at all. It is safe to raise now and was not before: since F-070 every model call is bounded by what
    // is left of the turn, so the budget can no longer be overshot by a call in flight, and a runaway stops
    // inside fifteen minutes instead of inside an unbounded one. The operator's override still wins.
    turnBudgetMs: positiveInt(process.env.KAMPAKU_TURN_BUDGET_MS) ?? 900_000,
    plannerMode: (process.env.KAMPAKU_PLANNER as PlannerMode) ?? "llm",
    plannerModel: process.env.KAMPAKU_PLANNER_MODEL ?? "auto",
    // High where a decision is made, low where it is carried out. Both are the endpoint's own vocabulary
    // and both can be switched off; see docs/concepts/token-economy.md.
    plannerReasoningEffort: reasoningEffort(process.env.KAMPAKU_PLANNER_REASONING_EFFORT, "high"),
    agentMode: (process.env.KAMPAKU_AGENT as AgentMode) ?? "stub",
    agentModel: process.env.KAMPAKU_AGENT_MODEL ?? "auto",
    agentReasoningEffort: reasoningEffort(process.env.KAMPAKU_AGENT_REASONING_EFFORT, "low"),
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

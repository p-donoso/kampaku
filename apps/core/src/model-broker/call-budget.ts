/**
 * One model call's time budget, and the latency it actually spent.
 *
 * This module exists because of a measured defect rather than a design preference. `AppConfig` documents
 * `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS` (*"how long a first attempt may take"*) and
 * `KAMPAKU_MODEL_INITIAL_RETRIES`, defaults them (120 s, 3) and exports them — and **no other module in
 * `apps/core/src` read either one**. The broker handed the call straight to the SDK with no per-request
 * timeout and no retry policy of its own, so an operator tuning those two numbers was tuning nothing
 * (BOARD F-061).
 *
 * The same runs left the second half of the defect: 955 s spent across five in-turn model calls with no
 * record of what any single call cost, so a turn that stopped could not say whether it had been waiting on
 * the provider or working (BOARD F-060). A call therefore returns its latency and how many attempts it
 * took, and the caller carries both into the turn's accounting.
 *
 * The policy is a pure function so both properties can be locked without a network: `attempt` is injected,
 * and the timeout is handed to it as a number rather than enforced by racing a clock here. Racing would
 * mean this function resolves while the abandoned request keeps running, and an unattached promise that
 * fails later is the shape that turns into an unhandled rejection in a long turn.
 */

export interface ModelCallPolicy {
  /** How long one attempt may take. Absent means the endpoint's own behaviour is the only bound. */
  timeoutMs?: number;
  /** How many times a failed attempt is retried, after the first. */
  retries: number;
  /** Named in the refusal, so the operator knows which call ran out of time. */
  label: string;
}

export interface ModelCallOutcome<T> {
  value: T;
  /** Wall clock across every attempt, including the ones that failed. */
  latencyMs: number;
  /** 1 when the first attempt answered. */
  attempts: number;
}

/**
 * A model call that failed every attempt it was allowed.
 *
 * Carries the numbers, because the failure an operator has to act on is *"eight attempts of at most 120 s
 * each"* and not *"the request timed out"*: the first is a setting to change and the second is a mystery.
 * `attempts` and `timeoutMs` are also what the turn's accounting reports for a call that never answered.
 */
export class ModelCallBudgetError extends Error {
  constructor(
    readonly label: string,
    readonly attempts: number,
    readonly timeoutMs: number | undefined,
    readonly cause: unknown,
  ) {
    const perAttempt = timeoutMs ? ` of at most ${(timeoutMs / 1000).toFixed(0)}s each` : "";
    const detail = cause instanceof Error ? cause.message : String(cause ?? "no detail");
    super(
      `The ${label} failed after ${attempts} attempt(s)${perAttempt}. ` +
        `Set KAMPAKU_MODEL_INITIAL_TIMEOUT_MS and KAMPAKU_MODEL_INITIAL_RETRIES to change that. ` +
        `The endpoint said: ${detail}`,
    );
    this.name = "ModelCallBudgetError";
  }
}

/**
 * Runs one model call under its timeout and retry policy, and measures it.
 *
 * `isTerminal` lets a caller keep the existing rule that a refusal it must not retry is not retried. The
 * reasoning-effort rejection is the case this was written for: the same request would be refused again,
 * and a silent second attempt would spend the tokens twice on a call the operator never sees fail.
 */
export async function runWithCallBudget<T>(
  policy: ModelCallPolicy,
  attempt: (options: { timeoutMs?: number; attempt: number }) => Promise<T>,
  isTerminal?: (error: unknown) => boolean,
): Promise<ModelCallOutcome<T>> {
  const startedAt = Date.now();
  const totalAttempts = Math.max(1, Math.floor(policy.retries) + 1);
  let lastError: unknown;

  for (let index = 0; index < totalAttempts; index += 1) {
    try {
      const value = await attempt({ timeoutMs: policy.timeoutMs, attempt: index });
      return { value, latencyMs: Date.now() - startedAt, attempts: index + 1 };
    } catch (error) {
      lastError = error;
      const made = index + 1;
      if (isTerminal?.(error)) {
        throw new ModelCallBudgetError(policy.label, made, policy.timeoutMs, error);
      }
      if (made >= totalAttempts) {
        throw new ModelCallBudgetError(policy.label, made, policy.timeoutMs, error);
      }
    }
  }

  // Unreachable: the loop either returns or throws. Kept so the compiler sees both paths.
  throw new ModelCallBudgetError(policy.label, totalAttempts, policy.timeoutMs, lastError);
}

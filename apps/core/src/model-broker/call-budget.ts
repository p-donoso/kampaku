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
  /**
   * The turn's own deadline, as an epoch millisecond. When set, no attempt may outlive it.
   *
   * This is BOARD F-070, and it is the difference between a bound and a number. Measured 2026-09-29 by
   * suite 07 run 19 on the shipped 300 000 ms default: the turn stopped at **5.1 of 5.0 minutes**, because
   * the budget was checked at the top of the loop and the last call it had started ran to completion — 291 s
   * inside one delegation. Worse, the per-call policy F-061 had just made real (120 s × 4 attempts = 480 s)
   * can put a single call's worst case **above the whole default budget**, so a turn could overshoot its own
   * bound by eight minutes while the reply still called that bound a bound.
   *
   * Carrying the deadline into the call site is what fixes it: an attempt is allotted the smaller of its own
   * timeout and what is left of the turn, so the turn's clock bites **during** a call rather than after it.
   */
  deadlineAt?: number;
}

/**
 * Why a call gave up, which decides how the turn reports it.
 *
 * The distinction is not cosmetic. A call cut short by the turn's own clock is a **budget stop** — the
 * operator's own setting working — and reporting it as a provider failure would send them to check a healthy
 * endpoint. That mislabelling is the defect class this product exists to refuse, so the cause travels with
 * the error instead of being inferred from its text.
 */
export type ModelCallBudgetReason = "attempts_exhausted" | "turn_deadline";

/** What an attempt may take, given its own policy and what is left of the turn. */
export function attemptTimeout(
  policy: Pick<ModelCallPolicy, "timeoutMs" | "deadlineAt">,
  now = Date.now(),
): { timeoutMs?: number; expired: boolean } {
  if (policy.deadlineAt === undefined) return { timeoutMs: policy.timeoutMs, expired: false };
  const left = policy.deadlineAt - now;
  if (left <= 0) return { timeoutMs: undefined, expired: true };
  // No configured timeout is not a licence to run past the turn: the remaining time *is* the timeout.
  if (policy.timeoutMs === undefined) return { timeoutMs: left, expired: false };
  return { timeoutMs: Math.min(policy.timeoutMs, left), expired: false };
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
    readonly reason: ModelCallBudgetReason = "attempts_exhausted",
  ) {
    const perAttempt = timeoutMs ? ` of at most ${(timeoutMs / 1000).toFixed(0)}s each` : "";
    const detail = cause instanceof Error ? cause.message : String(cause ?? "no detail");
    super(
      reason === "turn_deadline"
        ? `The turn's own time budget ran out during the ${label}, after ${attempts} attempt(s). ` +
            "That is a budget stop, not a provider failure: the endpoint was reached and the clock was the " +
            "bound. Raise KAMPAKU_TURN_BUDGET_MS to give the turn longer. " +
            `The endpoint said: ${detail}`
        : `The ${label} failed after ${attempts} attempt(s)${perAttempt}. ` +
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

  /**
   * The cause of a failure, as the clock sees it rather than as the message reads.
   *
   * `turn_deadline` when the turn's own deadline has passed by the time the call gives up — which is the case
   * the derived timeout creates deliberately — and `attempts_exhausted` otherwise. Read from the clock
   * instead of matched against text, because the text of a timeout is written by whichever SDK raised it.
   */
  const cause = (): ModelCallBudgetReason =>
    policy.deadlineAt !== undefined && Date.now() >= policy.deadlineAt
      ? "turn_deadline"
      : "attempts_exhausted";

  for (let index = 0; index < totalAttempts; index += 1) {
    const allowed = attemptTimeout(policy);
    if (allowed.expired) {
      // Every attempt is bounded by what is left of the turn, so there is nothing to retry with here: the
      // turn is over and the call never leaves. Reported as the turn's stop, not the endpoint's failure.
      throw new ModelCallBudgetError(policy.label, index, policy.timeoutMs, lastError, "turn_deadline");
    }
    try {
      const value = await attempt({ timeoutMs: allowed.timeoutMs, attempt: index });
      return { value, latencyMs: Date.now() - startedAt, attempts: index + 1 };
    } catch (error) {
      lastError = error;
      const made = index + 1;
      if (isTerminal?.(error)) {
        throw new ModelCallBudgetError(policy.label, made, policy.timeoutMs, error, cause());
      }
      if (made >= totalAttempts) {
        throw new ModelCallBudgetError(policy.label, made, policy.timeoutMs, error, cause());
      }
    }
  }

  // Unreachable: the loop either returns or throws. Kept so the compiler sees both paths.
  throw new ModelCallBudgetError(policy.label, totalAttempts, policy.timeoutMs, lastError, cause());
}

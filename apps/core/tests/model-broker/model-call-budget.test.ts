import { describe, expect, it, vi } from "vitest";
import {
  ModelCallBudgetError,
  attemptTimeout,
  runWithCallBudget,
} from "../../src/model-broker/call-budget.js";
import { createModelBroker } from "../../src/model-broker/client.js";
import { renderAccounting } from "../../src/agents/runtime/turn-accounting.js";

/**
 * The lock on the per-call budget, and on the record of what a call cost.
 *
 * Two measured defects, one cause: the product knew how long a turn took and nothing about what it spent
 * the time on.
 *
 * - **F-061.** `AppConfig` documents `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS` (*"how long a first attempt may
 *   take"*) and `KAMPAKU_MODEL_INITIAL_RETRIES`, defaults them (120 000, 3), exports them — and a grep over
 *   `apps/core/src` found **no other reader**. So the documented surface promised a bound on an attempt and
 *   there was none, and the arithmetic that would explain the next defect was unevaluable. Measured
 *   2026-09-25: 8 model calls at the stated 120 s timeout is 960 s, and the measured turn was **955 s**.
 * - **F-060.** Measured 2026-09-26 taking suite 07 (run 3): prompt 1 ran **955 s over five in-turn model
 *   calls**, and the same endpoint answered the same prompt in **3.1 s** when called directly. Nothing
 *   recorded any single call's latency, so neither the operator nor the suite could tell a slow provider
 *   from slow work.
 *
 * What is asserted here: the settings reach the code that spends them, the retry count is the one the
 * policy states, a terminal refusal is not retried, and every call reports its own latency and attempts so
 * the turn can say where the time went.
 */
describe("model call budget (F-061) and per-call latency (F-060)", () => {
  it("retries a failed attempt up to the configured count, and reports both numbers", async () => {
    const attempts: number[] = [];
    // `retries: 3` means the first attempt plus three retries — four in total, which is the reading the
    // setting's own documentation states (*"how many times a first attempt is retried"*). Off by one here
    // would either spend a call the operator did not authorize or give up one they did.
    const outcome = await runWithCallBudget({ retries: 3, label: "test call" }, async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt < 3) throw new Error("endpoint hiccup");
      return "answered";
    });

    expect(attempts).toEqual([0, 1, 2, 3]);
    expect(outcome.value).toBe("answered");
    // The count is the fact a stop has to report: "it failed" and "it failed eight times over sixteen
    // minutes" send an operator to two different places.
    expect(outcome.attempts).toBe(4);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("fails with the numbers after the allowed attempts, rather than only naming the cause", async () => {
    let calls = 0;
    await expect(
      runWithCallBudget({ retries: 1, timeoutMs: 120_000, label: "tool-calling completion" }, async () => {
        calls += 1;
        throw new Error("socket hang up");
      }),
    ).rejects.toBeInstanceOf(ModelCallBudgetError);

    // One retry means two attempts, no more: a policy that quietly retried forever would be a runaway with
    // a name that reads like a bound.
    expect(calls).toBe(2);
    await expect(
      runWithCallBudget({ retries: 0, timeoutMs: 120_000, label: "tool-calling completion" }, async () => {
        throw new Error("socket hang up");
      }),
    ).rejects.toThrow(/2 attempt\(s\)|1 attempt\(s\)/);
  });

  it("does not retry a refusal the same request would receive again", async () => {
    // The reasoning-effort rejection is the measured case: the endpoint refuses the parameter itself, so a
    // second identical attempt spends the tokens twice on a call the operator never sees fail.
    let calls = 0;
    const terminal = Object.assign(new Error("reasoning_effort is not supported"), { status: 400 });

    await expect(
      runWithCallBudget(
        { retries: 3, label: "text completion" },
        async () => {
          calls += 1;
          throw terminal;
        },
        () => true,
      ),
    ).rejects.toBeInstanceOf(ModelCallBudgetError);

    expect(calls).toBe(1);
  });

  it("hands the configured timeout to the request, and reads it back from the broker", () => {
    // The defect was that the two settings reached nothing. A broker built the one way the product builds
    // brokers has to carry them, because a role that has to remember its own timeout will forget.
    const broker = createModelBroker({
      baseUrl: "http://127.0.0.1:1/v1",
      model: "test-model",
      initialTimeoutMs: 120_000,
      initialRetries: 2,
    });

    expect(broker.callPolicyInUse()).toEqual({ timeoutMs: 120_000, retries: 2 });
  });

  it("treats an absent or zero timeout as no bound, instead of a zero-second one", () => {
    // Zero would abort every call before it was sent, which is a worse failure than no timeout at all: it
    // would look like an endpoint that never answers.
    expect(createModelBroker({ baseUrl: "http://127.0.0.1:1/v1", model: "m" }).callPolicyInUse()).toEqual({
      timeoutMs: undefined,
      retries: 0,
    });
    expect(
      createModelBroker({ baseUrl: "http://127.0.0.1:1/v1", model: "m", initialTimeoutMs: 0 })
        .callPolicyInUse().timeoutMs,
    ).toBeUndefined();
  });

  it("renders the split the operator asks about, and counts delegated work separately", () => {
    // "Why did that take eleven minutes?" has three possible answers and the line has to distinguish them:
    // the model calls, the tools, and a delegated session that is inside this turn's clock but not its call
    // log. Measured 2026-09-28 (run 16): a 60-minute turn reported *"1 model calls and 1 tool calls"* while
    // the session it waited on made **5 model calls and 17 tool calls**.
    const line = renderAccounting({
      elapsedMs: 660_000,
      modelCalls: 1,
      modelLatencyMs: 62_000,
      slowestCallMs: 62_000,
      retriedCalls: 0,
      toolCalls: 1,
      toolLatencyMs: 600_000,
      nestedModelCalls: 5,
      nestedElapsedMs: 600_000,
      slowestTool: { name: "delegate_to_agent", elapsedMs: 600_000 },
    });

    expect(line).toContain("660s total");
    expect(line).toContain("1 model call in 62s (slowest 62s)");
    expect(line).toContain("slowest delegate_to_agent 600s");
    expect(line).toContain("delegated sessions: 5 model calls in 600s");
  });

  it("never lets one call outlive the turn it belongs to (F-070)", async () => {
    // The measurement this locks: suite 07 run 19, on the shipped 300 000 ms default, stopped at
    // **5.1 of 5.0 minutes** because the budget was checked at the top of the loop and the last call ran to
    // completion — 291 s of it inside one delegation. Worse, the per-call policy F-061 had just made real
    // (120 s × 4 attempts = 480 s) could put a single call's worst case **above the whole budget**.
    const now = 1_000_000;

    // A turn with two minutes left and a 120 s per-attempt timeout: the attempt gets the smaller of the two,
    // so a retry cannot push the call past the turn.
    expect(attemptTimeout({ timeoutMs: 120_000, deadlineAt: now + 120_000 }, now)).toEqual({
      timeoutMs: 120_000,
      expired: false,
    });
    expect(attemptTimeout({ timeoutMs: 480_000, deadlineAt: now + 30_000 }, now)).toEqual({
      timeoutMs: 30_000,
      expired: false,
    });
    // No configured timeout is not a licence to run past the turn: what remains **is** the timeout.
    expect(attemptTimeout({ deadlineAt: now + 45_000 }, now)).toEqual({
      timeoutMs: 45_000,
      expired: false,
    });
    // And a turn with nothing left sends nothing at all.
    expect(attemptTimeout({ timeoutMs: 120_000, deadlineAt: now }, now).expired).toBe(true);
    // Without a deadline nothing changes: this is the behaviour every caller had before, kept intact.
    expect(attemptTimeout({ timeoutMs: 120_000 }, now)).toEqual({ timeoutMs: 120_000, expired: false });
  });

  it("reports a call cut by the turn's own clock as a budget stop, not a provider failure", async () => {
    // A label is not a detail. "The endpoint failed" sends an operator to check a healthy endpoint; "the turn's
    // clock ran out" sends them to the setting that caused it. The two arrive through the same throw site, so
    // the reason travels with the error instead of being guessed from its text.
    vi.useFakeTimers();
    try {
      const startedAt = Date.now();
      const call = runWithCallBudget(
        { retries: 3, timeoutMs: 120_000, deadlineAt: startedAt + 500, label: "tool-calling completion" },
        async ({ timeoutMs }) => {
          await new Promise((resolve) => setTimeout(resolve, timeoutMs ?? 1_000));
          throw new Error("aborted");
        },
      );
      // The attempt is allotted 500 ms — the turn's remainder — though its own timeout is 120 s. So the whole
      // call, retries included, cannot outlive the turn.
      const settled = call.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(600);
      const error = (await settled) as ModelCallBudgetError;

      expect(error).toBeInstanceOf(ModelCallBudgetError);
      expect(error.reason).toBe("turn_deadline");
      expect(error.attempts).toBe(1);
      expect(error.message).toMatch(/budget stop, not a provider failure/i);
      expect(error.message).toContain("KAMPAKU_TURN_BUDGET_MS");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still calls a genuine endpoint failure an endpoint failure", () => {
    // The other half of the distinction, and the reason it is read from the clock rather than matched against
    // text: a call that fails with the turn's clock still running is the endpoint's problem, and the message
    // must keep naming the two settings that fix it.
    const error = new ModelCallBudgetError(
      "tool-calling completion",
      4,
      120_000,
      new Error("socket hang up"),
    );
    expect(error.reason).toBe("attempts_exhausted");
    expect(error.message).toContain("KAMPAKU_MODEL_INITIAL_TIMEOUT_MS");
    expect(error.message).not.toMatch(/budget stop/i);
  });

  it("uses a mocked clock to prove the latency is measured, not declared", async () => {
    vi.useFakeTimers();
    try {
      const done = runWithCallBudget({ retries: 0, label: "test call" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        return "ok";
      });
      await vi.advanceTimersByTimeAsync(4_000);
      const outcome = await done;
      // A latency that is computed rather than measured would be zero here.
      expect(outcome.latencyMs).toBe(4_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

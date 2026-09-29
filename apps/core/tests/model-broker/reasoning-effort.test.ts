import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelBroker } from "../../src/model-broker/client.js";
import { loadConfig } from "../../src/config.js";

/**
 * The lock on the reasoning budget: planning may think hard, execution may not.
 *
 * The product has been paying for the wrong kind of thinking. Measured 2026-09-28 against the paid endpoint
 * that serves `auto:escalera`: the endpoint's default reasoning effort is `high`, so a plan-generation call
 * emitted **8 000–18 000 output tokens** and took 30–60 s — while the calls that actually carry work out ran
 * on the same default and bought the same deliberation. The turn budgets were never the problem: a suite 07
 * run spent 42 minutes and died on a malformed field, and the cost of a plan is one call per node per depth,
 * so the difference between `high` and `low` on the execution side is the difference between a cheap tool
 * loop and a paid essay about calling a tool.
 *
 * Three things are asserted, and the third is the one that keeps the first two honest:
 *
 * 1. **A configured budget is sent on every route.** A field that reaches `complete` but not
 *    `chatWithTools` would be invisible — the tool loop is the one that spends the most calls.
 * 2. **An absent budget sends no field at all.** "Ask for less" and "ask for the endpoint's default" are
 *    different requests, and an endpoint that rejects the parameter must be reachable by asking for neither.
 * 3. **A refusal is actionable rather than mysterious.** The parameter is not universal, so an endpoint can
 *    reject the whole call; the message names the two settings and how to switch the behaviour off. And a
 *    rejection that merely *mentions* the phrase must not be relabelled as this problem.
 *
 * The roles themselves — which call site gets which budget — are locked in
 * `tests/application/model-role-effort.test.ts`, against the real planner.
 */

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class {
    baseURL = "http://127.0.0.1:9999/v1";

    chat = { completions: { create } };
  },
}));

function reply() {
  return {
    model: "test-model",
    choices: [{ message: { content: "{}", tool_calls: undefined } }],
    usage: { prompt_tokens: 10 },
  };
}

const tool = {
  type: "function" as const,
  function: {
    name: "noop",
    description: "does nothing",
    parameters: { type: "object", properties: {} },
  },
};

function broker(reasoningEffort?: string) {
  return createModelBroker({
    baseUrl: "http://127.0.0.1:9999/v1",
    apiKey: "test",
    model: "test-model",
    reasoningEffort,
  });
}

/** The three routes a model call can take. */
const routes = [
  ["chat", (b: ReturnType<typeof broker>) => b.chat([{ role: "user" as const, content: "hi" }])],
  ["complete", (b: ReturnType<typeof broker>) => b.complete([{ role: "user" as const, content: "hi" }])],
  [
    "chatWithTools",
    (b: ReturnType<typeof broker>) => b.chatWithTools([{ role: "user" as const, content: "hi" }], [tool]),
  ],
] as const;

describe("the reasoning budget a call asks for", () => {
  afterEach(() => {
    create.mockReset();
  });

  it.each(routes)("carries the configured budget through %s", async (_name, call) => {
    create.mockResolvedValue(reply());

    await call(broker("low"));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.reasoning_effort).toBe("low");
  });

  it("sends no reasoning field at all when no budget was asked for", async () => {
    create.mockResolvedValue(reply());

    await broker(undefined).complete([{ role: "user", content: "hi" }]);

    // Asserted as absence rather than as `undefined`, because the difference between "ask for less" and
    // "ask for the endpoint's default" is whether the key is on the wire at all.
    expect(Object.keys(create.mock.calls[0]?.[0] ?? {})).not.toContain("reasoning_effort");
  });

  it("names the two settings when the endpoint refuses the parameter", async () => {
    create.mockRejectedValue(
      Object.assign(
        new Error("400 Unsupported parameter: 'reasoning_effort' is not supported with this model."),
        { status: 400 },
      ),
    );

    const failure = broker("low")
      .complete([{ role: "user", content: "hi" }])
      .then(
        () => undefined,
        (error: Error) => error,
      );

    const error = await failure;
    expect(error?.message).toMatch(/KAMPAKU_PLANNER_REASONING_EFFORT=off/);
    expect(error?.message).toMatch(/KAMPAKU_AGENT_REASONING_EFFORT=off/);
    // The endpoint's own words are kept, so the operator can tell which endpoint said it.
    expect(error?.message).toContain("Unsupported parameter");
    // And the call is not quietly retried without the budget: a silent second attempt would spend the tokens
    // twice on a request the operator never sees fail.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not relabel an unrelated rejected request", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("400 Invalid request: the model field is required."), { status: 400 }),
    );

    await expect(broker("low").complete([{ role: "user", content: "hi" }])).rejects.toThrow(
      /the model field is required/,
    );
  });

  it("does not relabel a mention of the phrase when no budget was sent", async () => {
    // An endpoint's own error text is not evidence about a parameter this client never set. Claiming
    // otherwise would send the operator to change a setting that has nothing to do with the failure.
    create.mockRejectedValue(
      Object.assign(new Error("400 reasoning_effort is only supported on reasoning models."), {
        status: 400,
      }),
    );

    await expect(broker(undefined).complete([{ role: "user", content: "hi" }])).rejects.toThrow(
      /only supported on reasoning models/,
    );
  });

  it("does not relabel a failure that is not a rejected request", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("reasoning_effort timed out"), { status: 504 }),
    );

    await expect(broker("low").complete([{ role: "user", content: "hi" }])).rejects.toThrow(
      /timed out/,
    );
  });

  it("trims a padded value rather than sending the padding", async () => {
    create.mockResolvedValue(reply());

    await broker("  high  ").complete([{ role: "user", content: "hi" }]);

    expect(create.mock.calls[0]?.[0]?.reasoning_effort).toBe("high");
  });
});

describe("the two reasoning budgets in configuration", () => {
  const KEYS = ["KAMPAKU_PLANNER_REASONING_EFFORT", "KAMPAKU_AGENT_REASONING_EFFORT"];

  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it("defaults to high where a decision is made and low where it is carried out", () => {
    const config = loadConfig({});

    expect(config.plannerReasoningEffort).toBe("high");
    expect(config.agentReasoningEffort).toBe("low");
  });

  it("reads both from the environment", () => {
    process.env.KAMPAKU_PLANNER_REASONING_EFFORT = "max";
    process.env.KAMPAKU_AGENT_REASONING_EFFORT = "medium";

    const config = loadConfig({});

    expect(config.plannerReasoningEffort).toBe("max");
    expect(config.agentReasoningEffort).toBe("medium");
  });

  it("switches a role off, in the words an operator reaches for", () => {
    for (const off of ["off", "none", "false", "0", "OFF"]) {
      process.env.KAMPAKU_AGENT_REASONING_EFFORT = off;
      expect(loadConfig({}).agentReasoningEffort, `"${off}" must send nothing`).toBeUndefined();
    }
  });

  it("treats a blank value as unset rather than as off", () => {
    // A blank line in `.env` is a setting somebody left empty, not a decision to stop reasoning.
    process.env.KAMPAKU_PLANNER_REASONING_EFFORT = "   ";
    process.env.KAMPAKU_AGENT_REASONING_EFFORT = "";

    const config = loadConfig({});

    expect(config.plannerReasoningEffort).toBe("high");
    expect(config.agentReasoningEffort).toBe("low");
  });

  it("passes through a word no endpoint is known to know", () => {
    // The request is where a vocabulary mismatch is decided. A value swallowed here would be a setting that
    // appears to do nothing, which is the defect this whole field exists to avoid.
    process.env.KAMPAKU_PLANNER_REASONING_EFFORT = "maximal";

    expect(loadConfig({}).plannerReasoningEffort).toBe("maximal");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialChatCompletion,
  InitialResponseTimeoutError,
} from "../src/executor/openai-compatible-chat.js";

describe("createInitialChatCompletion", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries timed-out initial responses up to maxAttempts", async () => {
    const create = vi.fn().mockRejectedValue(new InitialResponseTimeoutError(1_000, 1));

    await expect(
      createInitialChatCompletion(
        { chat: { completions: { create } } },
        { model: "auto", messages: [] },
        {
          timeoutMs: 1_000,
          maxAttempts: 3,
          retryDelayMs: 0,
        },
      ),
    ).rejects.toBeInstanceOf(InitialResponseTimeoutError);

    expect(create).toHaveBeenCalledTimes(3);
  });

  it("returns on the first successful response", async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { role: "assistant" } }] });

    const response = await createInitialChatCompletion(
      { chat: { completions: { create } } },
      { model: "auto", messages: [] },
      {
        timeoutMs: 5_000,
        maxAttempts: 3,
      },
    );

    expect(response).toMatchObject({ choices: [{ message: { role: "assistant" } }] });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

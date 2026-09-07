import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialChatCompletion,
  InitialResponseTimeoutError,
  isTimeoutLikeError,
} from "../src/executor/freellm-chat.js";

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

  it("retries on generic timeout errors", async () => {
    const timeoutError = new Error("Request timed out");
    const create = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant" } }] });

    const response = await createInitialChatCompletion(
      { chat: { completions: { create } } },
      { model: "auto", messages: [] },
      {
        timeoutMs: 1_000,
        maxAttempts: 3,
        retryDelayMs: 0,
      },
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(response).toBeDefined();
  });

  it("retries on AbortError", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const create = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant" } }] });

    const response = await createInitialChatCompletion(
      { chat: { completions: { create } } },
      { model: "auto", messages: [] },
      {
        timeoutMs: 1_000,
        maxAttempts: 3,
        retryDelayMs: 0,
      },
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(response).toBeDefined();
  });

  it("does not retry on non-timeout errors", async () => {
    const otherError = new Error("API error");
    const create = vi.fn().mockRejectedValue(otherError);

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
    ).rejects.toThrow("API error");

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("logs retry attempts when log provided", async () => {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);
    const create = vi.fn()
      .mockRejectedValueOnce(new InitialResponseTimeoutError(1_000, 1))
      .mockResolvedValueOnce({ choices: [{ message: { role: "assistant" } }] });

    await createInitialChatCompletion(
      { chat: { completions: { create } } },
      { model: "auto", messages: [] },
      {
        timeoutMs: 1_000,
        maxAttempts: 3,
        retryDelayMs: 0,
        log,
      },
    );

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(l => l.includes("timeout") || l.includes("retry"))).toBe(true);
  });
});

describe("isTimeoutLikeError", () => {
  it("returns true for InitialResponseTimeoutError", () => {
    const error = new InitialResponseTimeoutError(1000, 1);
    expect(isTimeoutLikeError(error)).toBe(true);
  });

  it("returns true for Error with name AbortError", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(isTimeoutLikeError(error)).toBe(true);
  });

  it("returns true for Error with timeout in message", () => {
    expect(isTimeoutLikeError(new Error("Request timed out"))).toBe(true);
    expect(isTimeoutLikeError(new Error("Connection timeout"))).toBe(true);
    expect(isTimeoutLikeError(new Error("TIMEOUT"))).toBe(true);
  });

  it("returns true for Error with aborterror in message", () => {
    expect(isTimeoutLikeError(new Error("AbortError occurred"))).toBe(true);
  });

  it("returns false for non-Error objects", () => {
    expect(isTimeoutLikeError("string error")).toBe(false);
    expect(isTimeoutLikeError(null)).toBe(false);
    expect(isTimeoutLikeError(undefined)).toBe(false);
    expect(isTimeoutLikeError(123)).toBe(false);
  });

  it("returns false for Error without timeout indicators", () => {
    expect(isTimeoutLikeError(new Error("API error"))).toBe(false);
    expect(isTimeoutLikeError(new Error("Not found"))).toBe(false);
  });
});

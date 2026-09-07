import { describe, expect, it, vi } from "vitest";
import {
  createInitialChatCompletion,
  InitialResponseTimeoutError,
  isTimeoutLikeError,
  FREELLMAPI_INITIAL_TIMEOUT_CODE,
} from "../src/executor/freellm-chat.js";

describe("freellm-chat timeout handling", () => {
  it("succeeds on first attempt when model responds quickly", async () => {
    const create = vi.fn().mockResolvedValue({ model: "test", choices: [] });
    const client = { chat: { completions: { create } } };

    const result = await createInitialChatCompletion(client, { model: "test" }, {
      timeoutMs: 5000,
      maxAttempts: 3,
    });

    expect(result).toEqual({ model: "test", choices: [] });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds on second attempt after timeout", async () => {
    let attempt = 0;
    const create = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out")), 50);
        });
      }
      return Promise.resolve({ model: "test", choices: [] });
    });

    const client = { chat: { completions: { create } } };
    const logs: string[] = [];

    const result = await createInitialChatCompletion(client, { model: "test" }, {
      timeoutMs: 100,
      maxAttempts: 3,
      retryDelayMs: 100,
      log: (line) => logs.push(line),
    });

    expect(result).toEqual({ model: "test", choices: [] });
    expect(create).toHaveBeenCalledTimes(2);
    expect(logs.some(log => log.includes("timed out on attempt 1"))).toBe(true);
    expect(logs.some(log => log.includes("Retrying"))).toBe(true);
  });

  it("throws InitialResponseTimeoutError after all attempts exhausted", async () => {
    const create = vi.fn().mockImplementation(() =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), 50);
      })
    );

    const client = { chat: { completions: { create } } };

    await expect(
      createInitialChatCompletion(client, { model: "test" }, {
        timeoutMs: 100,
        maxAttempts: 2,
        retryDelayMs: 50,
      })
    ).rejects.toThrow("Request timed out");

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws non-timeout errors immediately without retry", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Authentication failed"));
    const client = { chat: { completions: { create } } };

    await expect(
      createInitialChatCompletion(client, { model: "test" }, {
        timeoutMs: 5000,
        maxAttempts: 3,
      })
    ).rejects.toThrow("Authentication failed");

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("handles timeout race condition by canceling timer", async () => {
    const create = vi.fn().mockResolvedValue({ model: "test", choices: [] });
    const client = { chat: { completions: { create } } };

    await createInitialChatCompletion(client, { model: "test" }, {
      timeoutMs: 100,
      maxAttempts: 1,
    });

    await new Promise(resolve => setTimeout(resolve, 150));
  });

  it("logs all attempts and outcomes when log function provided", async () => {
    let attempt = 0;
    const create = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        return Promise.reject(new Error("timeout"));
      }
      return Promise.resolve({ model: "test", choices: [] });
    });

    const client = { chat: { completions: { create } } };
    const logs: string[] = [];

    await createInitialChatCompletion(client, { model: "test" }, {
      timeoutMs: 5000,
      maxAttempts: 3,
      retryDelayMs: 50,
      log: (line) => logs.push(line),
    });

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some(log => log.includes("attempt 1"))).toBe(true);
    expect(logs.some(log => log.includes("attempt 2"))).toBe(true);
    expect(logs.some(log => log.includes("attempt 3"))).toBe(true);
  });

  it("converts non-Error rejections to Error objects", async () => {
    const create = vi.fn().mockRejectedValue("String error");
    const client = { chat: { completions: { create } } };

    await expect(
      createInitialChatCompletion(client, { model: "test" }, {
        timeoutMs: 5000,
        maxAttempts: 1,
      })
    ).rejects.toThrow("String error");
  });
});

describe("isTimeoutLikeError", () => {
  it("returns true for InitialResponseTimeoutError", () => {
    const error = new InitialResponseTimeoutError(5000, 3);
    expect(isTimeoutLikeError(error)).toBe(true);
  });

  it("returns true for AbortError by name", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(isTimeoutLikeError(error)).toBe(true);
  });

  it("returns true for errors with 'timed out' in message", () => {
    expect(isTimeoutLikeError(new Error("Request timed out"))).toBe(true);
  });

  it("returns true for errors with 'timeout' in message", () => {
    expect(isTimeoutLikeError(new Error("Connection timeout"))).toBe(true);
  });

  it("returns true for errors with 'aborterror' in message", () => {
    expect(isTimeoutLikeError(new Error("got aborterror"))).toBe(true);
  });

  it("returns false for non-Error objects", () => {
    expect(isTimeoutLikeError("string error")).toBe(false);
    expect(isTimeoutLikeError(null)).toBe(false);
    expect(isTimeoutLikeError(undefined)).toBe(false);
    expect(isTimeoutLikeError(42)).toBe(false);
  });

  it("returns false for non-timeout Error objects", () => {
    expect(isTimeoutLikeError(new Error("Network failure"))).toBe(false);
    expect(isTimeoutLikeError(new Error("Authentication failed"))).toBe(false);
  });
});

describe("InitialResponseTimeoutError", () => {
  it("constructs with correct properties and message", () => {
    const error = new InitialResponseTimeoutError(5000, 3);

    expect(error.code).toBe(FREELLMAPI_INITIAL_TIMEOUT_CODE);
    expect(error.timeoutMs).toBe(5000);
    expect(error.attempts).toBe(3);
    expect(error.message).toBe("FreeLLMApi did not respond within 5000ms after 3 attempts.");
    expect(error.name).toBe("InitialResponseTimeoutError");
  });

  it("uses singular 'attempt' for single attempt", () => {
    const error = new InitialResponseTimeoutError(5000, 1);
    expect(error.message).toBe("FreeLLMApi did not respond within 5000ms after 1 attempt.");
  });
});

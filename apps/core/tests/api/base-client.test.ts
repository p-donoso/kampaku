import { describe, expect, it } from "vitest";
import { BaseHttpClient, CoreClientError, describeHttpError } from "../../src/client/base-client.js";

/**
 * A failed request must say what the server said.
 *
 * The body was captured but never surfaced, so every failure read as a status code alone. Measured:
 * `kampaku questions answer <id>` printed `Failed to answer question: 400` while the body explained
 * `Only the current recipient can answer this question.` The half that tells the operator what to do
 * was the half being discarded.
 */
describe("describeHttpError", () => {
  it("includes the server's error field", () => {
    const message = describeHttpError(
      "Failed to answer question",
      400,
      JSON.stringify({ error: "Only the current recipient can answer this question." }),
    );
    expect(message).toContain("Failed to answer question: 400");
    expect(message).toContain("Only the current recipient can answer this question.");
  });

  it("falls back to a message field when there is no error field", () => {
    const message = describeHttpError(undefined, 500, JSON.stringify({ message: "boom" }));
    expect(message).toBe("Request failed: 500 — boom");
  });

  it("passes a plain-text body through", () => {
    expect(describeHttpError("Failed to list", 502, "Bad Gateway")).toBe(
      "Failed to list: 502 — Bad Gateway",
    );
  });

  it("stays a bare status when there is no body", () => {
    expect(describeHttpError("Failed to fetch", 404, "")).toBe("Failed to fetch: 404");
  });

  it("truncates a huge body so the message stays readable", () => {
    const message = describeHttpError("Failed", 400, "x".repeat(1000));
    expect(message.length).toBeLessThan(400);
    expect(message).toContain("…");
  });
});

class ProbeClient extends BaseHttpClient {}

/**
 * The client must state its own timeout instead of inheriting the runtime default.
 *
 * Without an explicit timeout the runtime applies its own headers timeout, which is far
 * shorter than a real agent turn (a model loop with tool calls on a large reasoning model
 * runs for minutes). When the client gives up first, the operator sees a crash while Core
 * keeps working: partial side effects, no record of the turn (LangProbe G-05).
 */
describe("BaseHttpClient timeout", () => {
  it("applies the configured timeout as an abort signal", async () => {
    let seen: RequestInit | undefined;
    const client = new ProbeClient({
      baseUrl: "http://core",
      timeoutMs: 60_000,
      fetch: async (_url, init) => {
        seen = init;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    await (client as unknown as { get: (p: string) => Promise<unknown> }).get("/api/v1/health");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("leaves the signal unset when no timeout is configured", async () => {
    let seen: RequestInit | undefined;
    const client = new ProbeClient({
      baseUrl: "http://core",
      fetch: async (_url, init) => {
        seen = init;
        return new Response("{}", { status: 200 });
      },
    });

    await (client as unknown as { get: (p: string) => Promise<unknown> }).get("/api/v1/health");
    expect(seen?.signal).toBeUndefined();
  });

  it("reports a timeout as a stated condition, not a raw transport stack", async () => {
    const client = new ProbeClient({
      baseUrl: "http://core",
      timeoutMs: 5_000,
      fetch: async () => {
        const cause = Object.assign(new Error("Headers Timeout Error"), {
          code: "UND_ERR_HEADERS_TIMEOUT",
        });
        throw Object.assign(new TypeError("fetch failed"), { cause });
      },
    });

    const error = await (
      client as unknown as { get: (p: string) => Promise<unknown> }
    )
      .get("/api/v1/agents/kampaku/chat")
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CoreClientError);
    expect((error as CoreClientError).message).toContain("timed out");
    expect((error as CoreClientError).message).toContain("KAMPAKU_CLIENT_TIMEOUT_MS");
    // The operator must be told the work may have continued, not just that the call failed.
    expect((error as CoreClientError).message).toContain("may still be running on Core");
  });

  /**
   * The reported duration must be the time actually spent, not the configured ceiling.
   * Regression: an earlier version stated "timed out after 1800s" for a request the transport
   * killed at 300s, because it printed the configured value instead of the elapsed one.
   */
  it("reports elapsed time and names the transport limit when that one fires first", async () => {
    const client = new ProbeClient({
      baseUrl: "http://core",
      timeoutMs: 1_800_000,
      fetch: async () => {
        const cause = Object.assign(new Error("Headers Timeout Error"), {
          code: "UND_ERR_HEADERS_TIMEOUT",
        });
        throw Object.assign(new TypeError("fetch failed"), { cause });
      },
    });

    const error = (await (
      client as unknown as { get: (p: string) => Promise<unknown> }
    )
      .get("/api/v1/agents/kampaku/chat")
      .catch((thrown: unknown) => thrown)) as CoreClientError;

    expect(error.message).toContain("(configured ceiling 1800s)");
    expect(error.message).toContain("transport's own timeout fired before the configured ceiling");
    // It must never claim the configured ceiling was the limit that fired.
    expect(error.message).not.toContain("timed out after 1800s");
  });

  it("reports a non-timeout transport failure as a failed request", async () => {
    const client = new ProbeClient({
      baseUrl: "http://core",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const error = await (
      client as unknown as { get: (p: string) => Promise<unknown> }
    )
      .get("/api/v1/health")
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CoreClientError);
    expect((error as CoreClientError).message).toContain("failed after");
    expect((error as CoreClientError).message).toContain("fetch failed");
    expect((error as CoreClientError).message).not.toContain("timed out");
  });
});

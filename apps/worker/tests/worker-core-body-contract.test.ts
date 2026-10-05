import { describe, it, expect, vi, afterEach } from "vitest";
import { REQUEST_BODY_FIELDS } from "../../core/src/api/request-body.js";
import { CoreClient } from "../src/worker-api/client.js";

/**
 * The worker's side of the platform's own request-body contract.
 *
 * Measured 2026-10-05 on run `s08r13`. The field guard that landed for BOARD F-101 refuses a body field the
 * route does not read — and `submitResult` serialised **its whole payload type** into the body, `jobId`
 * included, even though the id already rides in the path. So the first real job of that run completed its work
 * and then had its result refused:
 *
 * ```text
 * PUT /api/v1/jobs/120d6783-.../result
 *   400  does not read "jobId" ... Did you mean "leaseId" instead of "jobId"?
 * ```
 *
 * The worker's loop caught the error and went back to polling, so nothing retried it, nothing recorded it, and
 * the work item read `running` for the rest of the lease with **no error on the job, no event, and no blocker**.
 * The only trace was one line in the worker's own stdout.
 *
 * Why no suite caught it: F-101's lock tests Core's table from Core's side (routes registered, unknown fields
 * refused) and `eval-hands-off-execution.test.ts` drives the release path and reads the job back. Neither runs
 * the real client, so a client that speaks a **different** body than its own Core accepts was invisible from
 * both ends. That is the gap this test closes, and it closes it as a class: for every mutating call this client
 * makes, the body's keys must be a subset of the fields the route declares — and the route must be declared at
 * all, so a new endpoint cannot be added to the worker without deciding, in the same commit, what it sends.
 *
 * Verified **red** without the fix: `submitResult` sends `jobId`, which the route does not declare.
 */

type Captured = { method: string; url: string; keys: string[] };

const captured: Captured[] = [];

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      captured.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(url),
        keys: body && typeof body === "object" ? Object.keys(body) : [],
      });
      return new Response(JSON.stringify({ status: "accepted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Every mutating call the worker's client makes, and the Core route it lands on. */
const CALLS: ReadonlyArray<{
  name: string;
  route: string;
  run: (client: CoreClient) => Promise<unknown>;
}> = [
  {
    name: "registerWorker",
    route: "POST /api/v1/workers",
    run: (client) => client.registerWorker(),
  },
  {
    name: "submitResult",
    route: "PUT /api/v1/jobs/:jobId/result",
    run: (client) =>
      client.submitResult({
        jobId: "11111111-1111-4111-8111-111111111111",
        leaseId: "22222222-2222-4222-8222-222222222222",
        status: "succeeded",
        output: { filesChanged: ["src/textstats/input.py"] },
        finishedAt: new Date().toISOString(),
      }),
  },
  {
    name: "reportProgress",
    route: "POST /api/v1/jobs/:jobId/progress",
    run: (client) =>
      client.reportProgress(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "one line",
      ),
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  captured.length = 0;
});

describe("the worker speaks the request-body contract Core enforces", () => {
  it("every declared call is registered on Core, and sends nothing Core does not read", async () => {
    const findings: string[] = [];

    for (const call of CALLS) {
      stubFetch();
      const client = new CoreClient("http://127.0.0.1:1", "11111111-1111-4111-8111-111111111111");
      try {
        await call.run(client);
      } catch {
        // The stub answers 200 with a body the caller may not expect; what is under test is the request.
      }
      const request = captured[0];
      expect(request, `${call.name} made no request`).toBeDefined();

      const declared = REQUEST_BODY_FIELDS[call.route];
      if (!declared) {
        findings.push(`${call.name} -> ${call.method ?? ""} ${call.route} is not declared in REQUEST_BODY_FIELDS`);
        continue;
      }
      const unknown = request.keys.filter((key) => !declared.includes(key));
      if (unknown.length > 0) {
        findings.push(
          `${call.name} -> ${call.route} sends ${unknown.join(", ")}, which Core refuses. It accepts: ${declared.join(", ")}`,
        );
      }
      vi.unstubAllGlobals();
      captured.length = 0;
    }

    expect(findings, `the worker sends bodies Core refuses:\n${findings.join("\n")}`).toEqual([]);
  });

  it("names the id in the path, never in the result body", async () => {
    stubFetch();
    const client = new CoreClient("http://127.0.0.1:1", "11111111-1111-4111-8111-111111111111");

    await client
      .submitResult({
        jobId: "11111111-1111-4111-8111-111111111111",
        leaseId: "22222222-2222-4222-8222-222222222222",
        status: "succeeded",
        finishedAt: new Date().toISOString(),
      })
      .catch(() => undefined);

    const request = captured[0];
    expect(request.url).toContain("/api/v1/jobs/11111111-1111-4111-8111-111111111111/result");
    expect(request.keys).not.toContain("jobId");
    expect(request.keys).toContain("leaseId");
    expect(request.keys).toContain("status");
    // Every key present is one the route reads. Optional fields (`output`, `error`) are absent here because
    // `JSON.stringify` drops undefined ones, which is also how a real result without a file list travels.
    const declared = REQUEST_BODY_FIELDS["PUT /api/v1/jobs/:jobId/result"] ?? [];
    expect(request.keys.filter((key) => !declared.includes(key))).toEqual([]);
  });
});

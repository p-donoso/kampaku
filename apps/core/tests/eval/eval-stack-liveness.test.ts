import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { getRuntimeStatus, WORKER_STALE_AFTER_MS } from "../../src/application/pm/execution-status.js";

/**
 * The stack's own startup must not report a worker it does not have.
 *
 * The defect this locks out was measured opening suite 08 (hands-off execution, BOARD F-073). The
 * workspace `.env` still carried the pre-11 executor alias that roadmap 11 § Part A removed (the exact
 * string is in `docs/roadmap/11-multi-provider-routing.md` § legacy-alias decision, and is spelled out in
 * `docs/eval/08-hands-off-execution.md`; it is not repeated here because
 * `eval-endpoint-contract.test.ts` — correctly — fails on it appearing anywhere in shipped surface). The
 * worker refused it and exited in the same second, printing its own rejection to `worker.log`:
 *
 *   Invalid KAMPAKU_EXECUTOR: <the removed alias>. Expected "openai-compatible" or "echo".
 *
 * and `scripts/start.sh` printed
 *
 *   Starting Kampaku Worker (KAMPAKU_EXECUTOR=<the removed alias>)...
 *   Worker started (log: …/worker.log)
 *   …
 *   Kampaku stack is running.
 *
 * Core was healthy and the UI was up, so every surface an operator looks at said the stack was fine —
 * and no job could ever move, because the execution plane did not exist. The suite-08 brief names that
 * state precisely ("a Core-only boot produces a project whose jobs never move"), which is why the file
 * that is supposed to prevent it is the thing that must be checked.
 *
 * `start.sh` already asserts its *web* listener after a stale Next.js server was reported as running.
 * The worker had no assertion at all, and cannot be checked by listening on a port or by `kill -0`
 * alone: a worker that refuses its configuration is a process that exits before it ever registers.
 * So the mechanism is a wait on the product's own public surface — `GET /api/v1/runtime/status`, the
 * same `workersOnline` the web UI's runtime card reads. This file tests that mechanism behaviourally
 * against a fake Core, and tests that `start.sh` uses it and cannot reach its success banner without it.
 */

function repoRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "packages/contracts"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the repository root from ${process.cwd()}`);
}

const root = repoRoot();

function read(relativePath: string): string {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(absolute, "utf8");
}

const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** A Core that reports whatever `workersOnline` the test sets, and nothing else. */
async function fakeCore(initialWorkersOnline: number): Promise<{ url: string; set: (value: number) => void }> {
  let workersOnline = initialWorkersOnline;
  const server = createServer((request, response) => {
    if (request.url !== "/api/v1/runtime/status") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ workersOnline, queuedJobs: 0, runningJobs: 0, zombieJobs: 0 }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake Core did not bind a port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    set: (value: number) => {
      workersOnline = value;
    },
  };
}

/**
 * Runs the helper the way `start.sh` runs it — sourced from `scripts/_common.sh`, not re-implemented —
 * and reports what it decided.
 */
/**
 * Asynchronous on purpose: `spawnSync` blocks this process's event loop, so the fake Core defined in
 * the same file could not answer a request while the child waited — every case would have read
 * "no worker", including the ones that must read one. A test whose control cannot serve is not a
 * control.
 */
function runWait(coreUrl: string, timeoutSeconds: number): Promise<{ registered: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bash",
      [
        "-c",
        `source "${join(root, "scripts/_common.sh")}"; ` +
          `if wait_for_worker_registration ${timeoutSeconds}; then echo REGISTERED; else echo NOT_REGISTERED; fi`,
      ],
      {
        cwd: root,
        env: { ...process.env, KAMPAKU_CORE_URL: coreUrl, KAMPAKU_DOTENV_OVERRIDE: "0" },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () =>
      resolve({
        registered: stdout.includes("REGISTERED") && !stdout.includes("NOT_REGISTERED"),
        stdout,
        stderr,
      }),
    );
  });
}

describe("a worker that never registers is not reported as started", () => {
  it("refuses to call a worker up when Core counts none", async () => {
    const core = await fakeCore(0);
    const decision = await runWait(core.url, 2);
    expect(decision.stdout.trim(), "the helper must report that no worker registered").toBe("NOT_REGISTERED");
  });

  it("accepts a Core that counts one", async () => {
    const core = await fakeCore(1);
    const decision = await runWait(core.url, 5);
    expect(decision.stdout.trim()).toBe("REGISTERED");
  });

  /**
   * The measured defect is the *first* second of the worker's life, so the check has to be a wait and
   * not a single read: registration is a poll away from `start.sh` returning. A one-shot read would
   * fail a healthy stack, which is how a guard gets deleted.
   */
  it("waits for a worker that registers late instead of reading once", async () => {
    const core = await fakeCore(0);
    setTimeout(() => core.set(1), 1_000);
    const decision = await runWait(core.url, 10);
    expect(decision.stdout.trim()).toBe("REGISTERED");
  });

  it("treats an unreachable Core as no worker rather than as success", async () => {
    const decision = await runWait("http://127.0.0.1:1", 2);
    expect(decision.stdout.trim()).toBe("NOT_REGISTERED");
  });
});

/**
 * The number `start.sh` reads has to be able to decrease, or the assertion above is decoration.
 *
 * Measured 2026-09-29 (BOARD F-074): a worker was killed and `GET /api/v1/runtime/status` still answered
 * `workersOnline: 1` twenty-five seconds later, because nothing ever updated the row `POST /api/v1/workers`
 * writes. A count that only goes up cannot tell an operator whose worker died from one whose worker is
 * fine, and it is the surface the web UI's runtime card and this script both read.
 */
describe("a worker that has gone away stops counting as online", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function store(): Store {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-workers-"));
    dirs.push(dir);
    return new Store(createDb(join(dir, "kampaku.db")).db);
  }

  const worker = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "local-worker",
    capabilities: ["code.agent"],
    contractVersion: "0.1.0",
  };

  it("counts a worker Core has just heard from", () => {
    const s = store();
    const now = new Date("2026-09-29T21:00:00.000Z");
    s.upsertWorker({ ...worker, registeredAt: now.toISOString() });
    expect(getRuntimeStatus(s, { now }).workersOnline).toBe(1);
    expect(getRuntimeStatus(s, { now }).workersKnown).toBe(1);
  });

  it("stops counting one it has not heard from", () => {
    const s = store();
    const registered = new Date("2026-09-29T21:00:00.000Z");
    s.upsertWorker({ ...worker, registeredAt: registered.toISOString() });
    const later = new Date(registered.getTime() + WORKER_STALE_AFTER_MS + 1_000);
    const status = getRuntimeStatus(s, { now: later });
    expect(status.workersOnline, "a worker no longer heard from is not online").toBe(0);
    expect(status.workersKnown, "and it is still a worker the instance knows about").toBe(1);
  });

  it("keeps one online while it keeps polling", () => {
    const s = store();
    const registered = new Date("2026-09-29T21:00:00.000Z");
    s.upsertWorker({ ...worker, registeredAt: registered.toISOString() });
    const later = new Date(registered.getTime() + WORKER_STALE_AFTER_MS + 1_000);
    s.touchWorker(worker.id, later.toISOString());
    expect(getRuntimeStatus(s, { now: later }).workersOnline).toBe(1);
  });
});

describe("start.sh cannot reach its success banner without a registered worker", () => {
  const start = read("scripts/start.sh");
  const common = read("scripts/_common.sh");

  it("reads the product's own public liveness surface rather than the process table", () => {
    expect(common, "scripts/_common.sh must define the wait").toContain("wait_for_worker_registration()");
    expect(
      common,
      "the check must read the public runtime surface — the same number the web UI shows",
    ).toContain("/api/v1/runtime/status");
    expect(common, "the check must look at workersOnline").toContain("workersOnline");
  });

  it("holds the worker to it, and to still being alive", () => {
    const worker = start.slice(start.indexOf("start_worker() {"), start.indexOf("start_web() {"));
    expect(worker, "start_worker must assert registration").toContain("wait_for_worker_registration");
    expect(worker, "registration and liveness are two questions, so both are asked").toContain(
      'is_running "$worker_pid"',
    );
    expect(
      worker,
      "a spawned process can be alive for a moment and still be doomed, so the check must settle",
    ).toContain("sleep 0.5");
    expect(worker, "a worker that failed must not be reported as started").not.toMatch(
      /^\s*echo "Worker started/m,
    );
    expect(worker, "the failure must carry the worker's own log tail").toContain("tail -n 10");
  });

  it("invokes the assertion before the banner, not after it", () => {
    const invoke = start.indexOf("\nstart_worker\n");
    // The exact line that prints it: this file's own comment about the defect quotes the banner, so a
    // bare substring search finds the explanation instead of the print.
    const banner = start.indexOf('echo "Kampaku stack is running."');
    expect(invoke, "start.sh must invoke start_worker").toBeGreaterThanOrEqual(0);
    expect(banner, "start.sh must still print its success banner").toBeGreaterThan(-1);
    expect(
      invoke < banner,
      "the banner is printed after the worker assertion, so a failed worker aborts before it",
    ).toBe(true);
  });
});

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig, type AppConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { missingProjectNotice } from "../../src/cli/commands/dev.js";
import { ensureChatPreflight } from "../../src/cli/repl.js";

/**
 * The documented first run has to reach a factory that can accept a turn (BOARD F-110).
 *
 * Measured on suite 01's run `s01r8` (2026-10-05), on a fresh data dir: the README's Quick start is
 * clone → `npm install` → `cp .env.example .env` → verify → `./scripts/kampaku dev`, and **nothing there
 * creates the default project**. `serve` does not either — `bootstrapKampakuPlatformTeam` and
 * `ensureProjectsDir` are what it bootstraps, and `bootstrapKampakuProject` has exactly one caller, the
 * `bootstrap` command — so `GET /api/v1/projects` answered `{"projects":[]}`, `bootstrap_state` held no
 * `default_project`, and the instance had 9 agents and 0 projects while Core, worker, web and
 * `/api/v1/health` all reported healthy (`workersOnline: 1`). `ensureChatPreflight` then refused every turn
 * with *"No project found. Run `kampaku bootstrap` first."* — the product being right about a state nothing
 * on the start path had named, and no turn drivable until `kampaku bootstrap` was run by hand. The same
 * run found the third leg: `scripts/install.sh` ran `npm run bootstrap`, and the root `package.json`
 * defines no such script, so the last step of the documented install path answered
 * `npm ERR! Missing script: "bootstrap"`.
 *
 * The chosen shape is the **non-creating** one. The start path states the step it needs and verifies it; it
 * does not create a container behind the operator, because suite 01's oracle reads a fresh instance's
 * contents and a start path that quietly wrote a project would change what that suite measures. Whether
 * `serve`/`dev` *should* create the default project is a product decision about what starting the stack
 * means, and it is not taken here — this file holds the line at "say it, do not silently do it", and fails
 * if a start path grows that side effect.
 *
 * Every case is written to fail without its fix (verified red before it was green — see the BOARD row).
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

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const server of servers.splice(0)) server.close();
  vi.restoreAllMocks();
});

/**
 * A fresh instance, exactly as the documented start path leaves it: the database, the projects folder and
 * the platform team exist; no project does.
 */
async function freshInstance() {
  const dataDir = mkdtempSync(join(tmpdir(), "kampaku-first-run-"));
  tempDirs.push(dataDir);
  const workspaceRoot = join(dataDir, "workspace");
  const projectsDir = join(dataDir, "projects");
  mkdirSync(workspaceRoot, { recursive: true });

  const config = loadConfig({
    dataDir,
    dbPath: join(dataDir, "kampaku.db"),
    workspaceRoot,
    projectsDir,
    plannerMode: "stub",
    agentMode: "stub",
  });

  const { db } = createDb(config.dbPath);
  const store = new Store(db);
  const agentStore = new AgentStore(db);
  const pmStore = new PmStore(db);
  const journalStore = new JournalStore(db, pmStore);
  const questionStore = new QuestionStore(db, agentStore, pmStore);
  const blockageStore = new BlockageStore(db, agentStore, pmStore);
  questionStore.setBlockageStore(blockageStore);
  questionStore.setJournalStore(journalStore);
  blockageStore.setQuestionStore(questionStore);
  blockageStore.setJournalStore(journalStore);

  const { createApp } = await import("../../src/api/app.js");
  const app = createApp(
    store,
    config,
    agentStore,
    pmStore,
    new ConversationStore(db),
    new SkillStore(db),
    questionStore,
    new MemoryStore(db),
    blockageStore,
    journalStore,
    undefined,
    undefined,
    undefined,
    new RefusalStore(db),
  );

  return { app, config, store, db, dataDir, workspaceRoot, projectsDir };
}

/** Serves the in-process app over a real socket, so a child process can be the thing that talks to it. */
async function listen(app: { fetch: (request: Request) => Response | Promise<Response> }) {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", async () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}${request.url}`;
      const proxied = await app.fetch(
        new Request(url, { method: request.method, headers: request.headers as HeadersInit, body }),
      );
      const text = await proxied.text();
      response.writeHead(proxied.status, { "content-type": proxied.headers.get("content-type") ?? "text/plain" });
      response.end(text);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the probe Core did not bind a port");
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Drives the **CLI** the way an operator does — as a child process against a Core that is listening — and
 * reports what it decided.
 *
 * `tsx` from `apps/core`, not `dist`: the same entry point `scripts/kampaku` and `kampaku dev` use when the
 * checkout has sources, so the check does not depend on a build having happened first.
 */
function runCliChat(coreUrl: string, dataDir: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/cli.ts", "chat", "-m", "hello"], {
      cwd: join(root, "apps/core"),
      env: {
        ...process.env,
        KAMPAKU_CORE_URL: coreUrl,
        KAMPAKU_DATA_DIR: dataDir,
        KAMPAKU_WORKSPACE: join(dataDir, "workspace"),
        KAMPAKU_PROJECTS_DIR: join(dataDir, "projects"),
        // The workspace `.env` is authoritative by default; an isolated run says so explicitly.
        KAMPAKU_DOTENV_OVERRIDE: "0",
        KAMPAKU_PLANNER: "stub",
        KAMPAKU_AGENT: "stub",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const NO_PROJECT_REFUSAL = "No project found. Run `kampaku bootstrap` first.";

describe("a fresh instance has no default project, and says so instead of inventing one", () => {
  it("starts read-only: no project, no default_project, and the projects folder is not the point", async () => {
    const instance = await freshInstance();

    // What `serve` legitimately bootstraps — the platform team — is here.
    expect(instance.store.listProjects(), "a fresh instance has no project").toEqual([]);
    expect(
      instance.store.getBootstrapState("default_project"),
      "and no default_project to point at one",
    ).toBeUndefined();

    // The surface `ensureChatPreflight` reads, through the product's own route.
    const response = await instance.app.request("/api/v1/projects/default");
    expect(response.status, "GET /api/v1/projects/default answers 404 while none exists").toBe(404);
  });

  // A timeout rather than the 5 s default: this case spawns `tsx` and waits on a child process, which is
  // the shape BOARD F-020 records — a test that shells out fails on a loaded host for a reason that is not a
  // product failure, and a red suite that is only an environment artifact teaches the operator to ignore red.
  it("refuses a chat turn with the command that fixes it, and exits non-zero", { timeout: 60_000 }, async () => {
    const instance = await freshInstance();
    const coreUrl = await listen(instance.app);

    const result = await runCliChat(coreUrl, instance.dataDir);

    expect(
      result.stderr,
      "the refusal has to name the command, or the operator is left to guess",
    ).toContain(NO_PROJECT_REFUSAL);
    expect(result.status, "a refused turn is not a successful turn").toBe(1);

    // The control on the other side of the same door: the refusal must be the *missing project*, not the
    // stack being unreachable — a preflight that fails for any reason would satisfy the line above.
    expect(result.stderr, "Core was reachable; the missing project is the reason").not.toContain(
      "Core is not running",
    );
  });

  it("accepts the turn once the default project exists", { timeout: 60_000 }, async () => {
    const instance = await freshInstance();
    const coreUrl = await listen(instance.app);

    // `kampaku bootstrap`: exactly what the command does — the project registry, the front-office agent and
    // the allowed folders. The db is optional here and left out: the half this case needs is the project.
    bootstrapProject(instance.store, instance.config as AppConfig);
    expect(instance.store.getBootstrapState("default_project")).toBeDefined();

    const result = await runCliChat(coreUrl, instance.dataDir);

    expect(result.stderr, "the preflight no longer refuses the turn").not.toContain(NO_PROJECT_REFUSAL);
  });

  it("does not create a project as a side effect of opening the app", async () => {
    const instance = await freshInstance();
    await instance.app.request("/api/v1/health");
    await instance.app.request("/api/v1/projects");
    await instance.app.request("/api/v1/projects/default");

    expect(
      instance.store.listProjects(),
      "reading a fresh instance must not write the container suite 01 measures",
    ).toEqual([]);
    expect(instance.store.getBootstrapState("default_project")).toBeUndefined();
  });
});

describe("the stack's own start path states the step it needs", () => {
  it("prints the missing-project notice with the exact command, and never on a bootstrapped instance", () => {
    const notice = missingProjectNotice(false, "http://127.0.0.1:28080");
    expect(notice, "a stack with no project must say so").toBeDefined();
    expect(notice).toContain("kampaku bootstrap");
    expect(notice, "and say why — the same sentence the turn's own refusal uses").toContain(
      "no chat turn can be accepted yet",
    );

    // The control: a bootstrapped instance says nothing at all, so the notice cannot become a permanent
    // banner that teaches the operator to ignore it.
    expect(missingProjectNotice(true, "http://127.0.0.1:28080")).toBeUndefined();
  });

  it("holds scripts/_common.sh to the same behaviour, against a fake Core", { timeout: 30_000 }, async () => {
    let projectExists = false;
    const server = createServer((request, response) => {
      if (request.url !== "/api/v1/projects/default") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(projectExists ? 200 : 404, { "content-type": "application/json" });
      response.end(projectExists ? "{}" : "");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("the fake Core did not bind a port");

    const decide = () =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(
          "bash",
          [
            "-c",
            `source "${join(root, "scripts/_common.sh")}"; warn_if_no_default_project; echo DECIDED`,
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              KAMPAKU_CORE_URL: `http://127.0.0.1:${address.port}`,
              KAMPAKU_DOTENV_OVERRIDE: "0",
            },
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
        child.on("close", () => resolve({ stdout, stderr }));
      });

    const missing = await decide();
    expect(missing.stderr, "a 404 is the absence, and the notice names the command").toContain(
      "kampaku bootstrap",
    );
    expect(missing.stderr, "and the state it is refusing on").toContain("No project found");
    expect(missing.stdout, "the check must not fail the start").toContain("DECIDED");

    projectExists = true;
    const present = await decide();
    expect(present.stderr, "a bootstrapped instance gets no notice").not.toContain("kampaku bootstrap");
  });

  it("calls the check in start.sh, before the banner", () => {
    const start = read("scripts/start.sh");
    const invoke = start.indexOf("\nwarn_if_no_default_project\n");
    const banner = start.indexOf('echo "Kampaku stack is running."');

    expect(invoke, "start.sh must invoke the check").toBeGreaterThanOrEqual(0);
    expect(banner, "start.sh must still print its success banner").toBeGreaterThan(-1);
    expect(
      invoke < banner,
      "the check runs before the success banner, so the banner cannot read as an all-clear",
    ).toBe(true);

    // And the check itself reads the product's own surface rather than assuming: a start path that printed
    // the notice unconditionally would be a second defect.
    const common = read("scripts/_common.sh");
    expect(common, "scripts/_common.sh owns the check").toContain("warn_if_no_default_project()");
    expect(common, "and reads the route that answers whether a default project exists").toContain(
      "/api/v1/projects/default",
    );
  });
});

describe("the documented first-run path names its own bootstrap step", () => {
  it("puts `kampaku bootstrap` in the Quick start before the start command", () => {
    const readme = read("README.md");
    const quickStart = readme.slice(readme.indexOf("## Quick start"));
    const section = quickStart.slice(0, quickStart.indexOf("\n## ", 1));

    const bootstrap = section.indexOf("kampaku bootstrap");
    const dev = section.indexOf("kampaku dev");

    expect(bootstrap, "the Quick start must name the bootstrap step").toBeGreaterThan(-1);
    expect(dev, "the Quick start still starts the stack").toBeGreaterThan(-1);
    expect(
      bootstrap < dev,
      "bootstrap must come before the start command: the stack does not create the project for you",
    ).toBe(true);
  });

  it("runs a script that exists — the last step of install.sh", () => {
    const install = read("scripts/install.sh");

    expect(install, "install.sh must not call the root script that does not exist").not.toContain(
      "npm run bootstrap\n",
    );
    expect(
      install,
      "install.sh must run the workspace script that does: `npm run bootstrap --workspace apps/core`",
    ).toContain("npm run bootstrap --workspace apps/core");

    // And the target exists, so the check cannot be satisfied by naming a script nobody wrote.
    const corePackage = JSON.parse(read("apps/core/package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(corePackage.scripts?.bootstrap, "apps/core must define the bootstrap script").toBeTruthy();
  });
});

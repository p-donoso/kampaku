import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeGetProject } from "../../src/agents/runtime/tools/get-project.js";
import { createApp } from "../../src/api/app.js";
import { registerProjectsCommand } from "../../src/cli/commands/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { Store } from "../../src/persistence/store.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";

/**
 * Suite 01's own lock: **a work order opens from chat, and it is real.**
 *
 * The suite's own Automated-tests table named this file as *to author* for six runs, which is why its
 * score was capped at 9 while the oracle held. The suite says what it must lock:
 *
 * > Intake from chat creates a container whose repository path exists and is outside the workspace;
 * > zero work items; three-surface slug parity.
 *
 * Everything here goes through the **agent path** — `runKampakuChat` with a broker that emits the tool
 * calls — because "the handler would create it" is a claim, and the whole F-001 defect was a capability
 * that existed in the application layer and was unreachable from the route the operator uses. A test
 * that called `executeCreateProject` directly would pass while chat still could not open a container.
 *
 * The sequence is the one run 7 actually produced, including the part nobody asked for: the lead is
 * created **before** the container, because `create_project` refuses a call without one (F-005) and
 * because nothing can link a lead to a container afterwards.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

/** An assistant message that calls `create_sub_agent`, then `create_project`, in that order. */
function assistantCallingCreateLeadThenContainer(input: {
  leadSlug: string;
  projectName: string;
  repositoryPath: string;
}) {
  return {
    model: "test-model",
    choices: [
      {
        message: {
          content: "",
          tool_calls: [
            {
              id: "call-lead",
              type: "function",
              function: {
                name: "create_sub_agent",
                arguments: JSON.stringify({
                  slug: input.leadSlug,
                  name: "Intake Demo Lead",
                  responsibilities: "Own the intake-demo work order",
                  system_prompt: "You lead intake-demo.",
                }),
              },
            },
            {
              id: "call-container",
              type: "function",
              function: {
                name: "create_project",
                arguments: JSON.stringify({
                  name: input.projectName,
                  project_lead_slug: input.leadSlug,
                  // The guarded form. A bare path skips repository validation entirely — BOARD F-033.
                  repositories: [{ url: `file://${input.repositoryPath}`, role: "web" }],
                }),
              },
            },
          ],
        },
      },
    ],
  };
}

function assistantSaying(content: string) {
  return { model: "test-model", choices: [{ message: { content, tool_calls: undefined } }] };
}

describe("eval 01 — work-order intake from chat", () => {
  let dataDir: string | undefined;
  let context: KampakuToolContext | undefined;
  let workspaceRoot: string | undefined;
  let repositoryPath: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    context = undefined;
    vi.clearAllMocks();
  });

  /**
   * An instance with a workspace, and a repository directory **outside** it, which is the arrangement
   * the suite requires: a container must not be able to live inside the factory's own checkout.
   */
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-01-"));
    dataDir = root;
    workspaceRoot = join(root, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });
    repositoryPath = join(root, "intake-demo");
    mkdirSync(repositoryPath, { recursive: true });

    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot,
      agentMode: "llm",
      plannerMode: "llm",
    });
    const { db } = createDb(config.dbPath);
    const ctx: KampakuToolContext = {
      store: new Store(db),
      agentStore: new AgentStore(db),
      conversationStore: new ConversationStore(db),
      pmStore: new PmStore(db),
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      questionStore: undefined,
      blockageStore: undefined,
      journalStore: undefined,
      wikiStore: undefined,
      postActionStore: undefined,
      refusalStore: undefined,
      config,
    };
    context = ctx;
    return { ctx, config, repositoryPath, workspaceRoot };
  }

  it("opens a container from chat, owned, at the requested path, with zero work items", async () => {
    const { ctx, config, repositoryPath: repo, workspaceRoot: workspace } = setup();
    ctx.agentStore.getKampakuAgent();

    mockBroker.chatWithTools
      .mockResolvedValueOnce(
        assistantCallingCreateLeadThenContainer({
          leadSlug: "intake-demo-lead",
          projectName: "intake-demo",
          repositoryPath: repo,
        }),
      )
      .mockResolvedValueOnce(
        assistantSaying("The work order container `intake-demo` is open, with `intake-demo-lead`."),
      );

    const response = await runKampakuChat(
      ctx,
      config,
      `Open a work order for intake-demo. Its repository lives at ${repo}.`,
    );

    // 1. The turn reached the tool that opens a container, from the chat path itself.
    expect(response.toolsUsed).toContain("create_project");

    // 2. The container exists, with the slug the reply named.
    const project = ctx.store.getProjectBySlug("intake-demo");
    expect(project).toBeDefined();
    expect(response.reply).toContain("intake-demo");

    // 3. Its linked repository is the requested path, which exists on disk.
    expect(project!.repositories).toHaveLength(1);
    expect(project!.repositories[0]!.url).toBe(`file://${repo}`);
    expect(existsSync(repo)).toBe(true);

    // 4. And it is outside the factory's own workspace. Checked by path, not by string prefix: a
    //    trailing-component coincidence must not pass this.
    const insideWorkspace = !relative(workspace, repo).startsWith("..");
    expect(insideWorkspace).toBe(false);

    // 5. An accountable owner is recorded, and it resolves to a slug a person can act on.
    expect(project!.projectLeadAgentId).toBeTruthy();
    const lead = ctx.agentStore.getAgentBySlugOrId(project!.projectLeadAgentId!);
    expect(lead?.slug).toBe("intake-demo-lead");

    // 6. Opening a work order creates no work.
    expect(ctx.pmStore.listWorkItemsByProject(project!.id)).toHaveLength(0);
  });

  /**
   * The same slug on every surface this test can reach. The web surface is
   * `apps/web/e2e/eval-work-order-intake.spec.ts`, which is the other half of this file's job.
   */
  it("reports the same slug and path the stores hold, so the surfaces cannot disagree", async () => {
    const { ctx, config, repositoryPath: repo } = setup();

    mockBroker.chatWithTools
      .mockResolvedValueOnce(
        assistantCallingCreateLeadThenContainer({
          leadSlug: "intake-demo-lead",
          projectName: "intake-demo",
          repositoryPath: repo,
        }),
      )
      .mockResolvedValueOnce(assistantSaying("Container `intake-demo` is open."));

    await runKampakuChat(ctx, config, "Open a work order for intake-demo.");

    const project = ctx.store.getProjectBySlug("intake-demo")!;
    const stored = ctx.store.listProjects().map((candidate) => candidate.slug);

    // One container for the slug, not two, and the same one the store lists.
    expect(stored.filter((slug) => slug === "intake-demo")).toHaveLength(1);
    // The id the store holds is the id every surface must show.
    expect(typeof project.id).toBe("string");
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    // And the path is stored as a path, never as a count — the field suite 02 then checks on three
    // surfaces at once.
    expect(project.repositories[0]!.url).toBe(`file://${repo}`);
  });

  /**
   * A turn that could not be read in full is not a measurement, so the lock asserts the turn fit. This
   * is the gate that six earlier runs of this suite were taken without: the endpoint was discarding the
   * front of every prompt and the reply was scored anyway (F-032).
   */
  it("does not report a truncated context, because a cut turn is not a measurement", async () => {
    const { ctx, config, repositoryPath: repo } = setup();

    mockBroker.chatWithTools
      .mockResolvedValueOnce(
        assistantCallingCreateLeadThenContainer({
          leadSlug: "intake-demo-lead",
          projectName: "intake-demo",
          repositoryPath: repo,
        }),
      )
      .mockResolvedValueOnce(assistantSaying("Done."));

    const response = await runKampakuChat(ctx, config, "Open a work order.");

    expect(response.contextTruncation).toBeUndefined();
  });

  /**
   * The other half of the suite's three-surface bullet, and the half run `s01r8` measured as missing.
   *
   * Measured 2026-10-05 on `s01r8`: chat returned the container's id and quoted the repository as
   * `file:///…`, REST returned both, and the two surfaces an operator reads **without** chat did neither
   * — `kampaku projects list` printed `slug  name  [status]` and a bare path, `projects show` printed a
   * bare path, and the web detail panel rendered `Slug`, `Lead`, `Repository` and no id at all. The
   * values never contradicted each other; the field and one spelling did not survive the round trip
   * (BOARD F-109).
   *
   * Both halves are asserted here against the product's own reads, and they are read the way the operator
   * reads them:
   *
   * | Surface | How it is read here |
   * |---|---|
   * | REST | the real app, served on a port, answering `GET /api/v1/projects[/:slug]` |
   * | CLI | `registerProjectsCommand` run through commander — the command the operator types, wired the
   * |       | way `src/cli/index.ts` wires it, **from source** rather than from `dist/` |
   * | chat | `executeGetProject`, the tool the front office holds |
   *
   * The CLI is a REST client, so it is served the product's own answer rather than a fixture of it: a
   * hand-written payload would lock the renderer against the test's idea of the API, which is exactly the
   * class of claim this suite exists to replace with a measurement.
   */
  it("carries the container's id and the repository string the store holds onto the non-chat surfaces", async () => {
    const { ctx, config, repositoryPath: repo, workspaceRoot } = setup();
    ctx.agentStore.getKampakuAgent();

    mockBroker.chatWithTools
      .mockResolvedValueOnce(
        assistantCallingCreateLeadThenContainer({
          leadSlug: "intake-demo-lead",
          projectName: "intake-demo",
          repositoryPath: repo,
        }),
      )
      .mockResolvedValueOnce(assistantSaying("Container `intake-demo` is open."));

    await runKampakuChat(ctx, config, "Open a work order for intake-demo.");

    const project = ctx.store.getProjectBySlug("intake-demo")!;
    // The two strings every surface has to agree on: the id the store minted, and the repository string
    // the store holds — a `file://` url, which is what REST and the agent path return.
    const url = `file://${repo}`;
    expect(project.repositories[0]!.url).toBe(url);

    const app = createApp(
      ctx.store,
      config,
      ctx.agentStore,
      ctx.pmStore,
      ctx.conversationStore,
      ctx.skillStore,
    );
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const previous = {
      coreUrl: process.env.KAMPAKU_CORE_URL,
      dotenv: process.env.KAMPAKU_DOTENV_OVERRIDE,
      dataDir: process.env.KAMPAKU_DATA_DIR,
      workspace: process.env.KAMPAKU_WORKSPACE,
    };
    process.env.KAMPAKU_CORE_URL = `http://127.0.0.1:${port}`;
    // The checkout's own `.env` names the live instance's port and data dir, and loads after the process
    // environment unless this is `0` — the documented trap that cost the baseline runs real time. Without
    // it this lock would read somebody else's stack and pass on a container it never created.
    process.env.KAMPAKU_DOTENV_OVERRIDE = "0";
    process.env.KAMPAKU_DATA_DIR = dataDir!;
    process.env.KAMPAKU_WORKSPACE = workspaceRoot!;

    const lines: string[] = [];
    const record = (...args: unknown[]) => {
      lines.push(args.join(" "));
    };
    const log = vi.spyOn(console, "log").mockImplementation(record);
    const error = vi.spyOn(console, "error").mockImplementation(record);
    // A CLI that cannot reach Core calls `process.exit(1)`. Left alone that would kill the test worker
    // and lose the reason; here it fails the assertion with the CLI's own message.
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`the CLI exited ${code ?? 0}:\n${lines.join("\n")}`);
    }) as never);

    const runCli = async (argv: string[]) => {
      const program = new Command();
      program.name("kampaku").exitOverride();
      registerProjectsCommand(program);
      lines.length = 0;
      await program.parseAsync(["node", "kampaku", ...argv]);
      return lines.join("\n");
    };

    try {
      const list = await runCli(["projects", "list"]);
      expect(list, "projects list does not print the container's id").toContain(project.id);
      expect(list, "projects list does not print the repository string the store holds").toContain(url);

      const show = await runCli(["projects", "show", "intake-demo"]);
      expect(show, "projects show does not print the container's id").toContain(project.id);
      expect(show, "projects show does not print the repository string the store holds").toContain(url);

      // The **owner slug**, which is the third field the suite's bullet names and the one this lock did
      // not read at first. Measured on `s01r8`: chat, the web UI and the durable-state block all named
      // `intake-demo-lead` while `projects show` printed no owner at all and REST answered the raw agent
      // id — a surface that answers an id where the others answer a slug agrees about the value and not
      // about the name. Read from the **same served app** the CLI just talked to, so this asserts one
      // resolved value rather than the renderer's own lookup.
      const restOverview = (await (
        await fetch(`http://127.0.0.1:${port}/api/v1/projects/intake-demo`)
      ).json()) as { project: { projectLeadSlug?: string | null; projectLeadAgentId?: string | null } };
      expect(
        restOverview.project.projectLeadAgentId,
        "premise: the store links an owner",
      ).toBeTruthy();
      expect(
        restOverview.project.projectLeadSlug,
        "REST does not resolve the link to the slug the other surfaces spell",
      ).toBe("intake-demo-lead");
      expect(
        show,
        "projects show does not print the owner as a slug",
      ).toContain("intake-demo-lead");

      // And the surface chat reads, from the same container: the same id and the same string. This is
      // what makes the three a comparison rather than three separate readings.
      const viaChat = executeGetProject(ctx, { project_slug_or_id: "intake-demo" });
      expect(viaChat.project.id).toBe(project.id);
      expect(viaChat.project.repositories[0]!.url).toBe(url);
      expect(viaChat.project.projectLeadSlug, "the agent path must name the same owner").toBe(
        "intake-demo-lead",
      );
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
      process.env.KAMPAKU_CORE_URL = previous.coreUrl;
      process.env.KAMPAKU_DOTENV_OVERRIDE = previous.dotenv;
      process.env.KAMPAKU_DATA_DIR = previous.dataDir;
      process.env.KAMPAKU_WORKSPACE = previous.workspace;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /**
   * And the refusal path, from the same route. A container with no accountable owner is not an open
   * work order, so the agent path must fail rather than report success — this is the half of F-005 that
   * protects the store, and run 5 is the only other place it has been observed.
   */
  it("refuses to open a work order with no owner, through the agent path, leaving nothing behind", async () => {
    const { ctx, config, repositoryPath: repo } = setup();

    mockBroker.chatWithTools
      .mockResolvedValueOnce({
        model: "test-model",
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call-container-only",
                  type: "function",
                  function: {
                    name: "create_project",
                    arguments: JSON.stringify({
                      name: "orphan-container",
                      repositories: [{ url: `file://${repo}`, role: "web" }],
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce(assistantSaying("That did not work."));

    await runKampakuChat(ctx, config, "Open a work order without a lead.");

    expect(ctx.store.getProjectBySlug("orphan-container")).toBeUndefined();
    expect(ctx.store.listProjects()).toHaveLength(0);
  });
});

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { Store } from "../../src/persistence/store.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import { runKampakuChat } from "../../src/agents/runtime/session.js";

/**
 * Suite 05's own lock: **a vague request produces a clarification before the board is flooded, and a
 * healthy instance does not generate phantom "missing foundation" work.**
 *
 * The suite states the promise and the measurement method:
 *
 * > A vague request produces clarification or a small options set **before** the board floods with
 * > invented tracks — and a healthy instance does not generate phantom "missing foundation" work.
 *
 * > Count work items, jobs, and agents before and after each prompt (public CLI/UI).
 *
 * Everything here goes through the **agent path** — `runKampakuChat` with a broker that emits the reply
 * the model would emit — for the reason suite 04's lock gives: the defect class this repository keeps
 * meeting is a rule that exists in a prompt and is unenforced, or a capability that exists in the
 * application layer and is unreachable. Asserting that `parsePendingQuestion` returns a record would pass
 * while a real chat turn still dropped the question; asserting that a plan *may* be created would pass
 * while nothing stops the board from flooding.
 *
 * Three tests, matching the suite's three suite-specific boxes:
 *
 * 1. the vague turn's clarify is a **durable, answerable** question, and the turn creates nothing;
 * 2. the tools that would flood the board do not execute when the model names them — and this is the half
 *    that has to be measured by **attempting**, because the front office's allowlist is only prompt text
 *    until dispatch enforces it (BOARD F-044);
 * 3. a **healthy** instance (a linked checkout with a CI workflow, a lead, a team) gains nothing from a
 *    vague turn: no container, no seat, no work item, no file on disk.
 */

const mockBroker = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  chatWithTools: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("../../src/model-broker/client.js", () => ({
  createModelBroker: () => mockBroker,
}));

function assistantCalling(name: string, args: Record<string, unknown>, id = `call-${name}`) {
  return {
    model: "test-model",
    choices: [
      {
        message: {
          content: "",
          tool_calls: [
            { id, type: "function", function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  };
}

function assistantCallingMany(calls: Array<{ name: string; args: Record<string, unknown> }>) {
  return {
    model: "test-model",
    choices: [
      {
        message: {
          content: "",
          tool_calls: calls.map((call, index) => ({
            id: `call-${index}`,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      },
    ],
  };
}

function assistantSaying(content: string) {
  return { model: "test-model", choices: [{ message: { content, tool_calls: undefined } }] };
}

/** The `<kampaku-question>` block the suite's own protocol asks the front office to end a clarify with. */
function clarifyReply() {
  const question = {
    id: "s05-improve-scope",
    type: "single_choice",
    prompt: "Which improvement do you want first: performance, test coverage, or the CLI's error messages?",
    options: ["performance", "test coverage", "the CLI's error messages"],
    required: true,
  };
  return [
    "I am not going to open twenty tracks for \"make it better\".",
    `<kampaku-question>${JSON.stringify(question)}</kampaku-question>`,
  ].join("\n");
}

/**
 * Every tool result the model was shown, as the model itself saw it.
 *
 * Read across all calls rather than from a fixed index: the message array is mutated in place as the turn
 * proceeds, so an index is an assumption about how many iterations ran.
 */
function toolResultsSeenByModel(): string {
  return mockBroker.chatWithTools.mock.calls
    .flatMap((call) => (call[0] ?? []) as Array<{ role: string; content: string }>)
    .filter((message) => message.role === "tool")
    .map((message) => message.content)
    .join("\n");
}

describe("eval 05 — vague intent is clarified, not flooded", () => {
  let dataDir: string | undefined;
  let context: KampakuToolContext | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    context = undefined;
    // `reset`, not `clear`: `clear` keeps an unconsumed `mockResolvedValueOnce` queued, and one unspent
    // value from an earlier test is enough to hand the next test a reply it never scripted.
    vi.resetAllMocks();
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-05-"));
    dataDir = root;
    const workspaceRoot = join(root, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });

    const config = loadConfig({
      dataDir: root,
      dbPath: join(root, "kampaku.db"),
      workspaceRoot,
      agentMode: "llm",
      plannerMode: "llm",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore: new ConversationStore(db),
      pmStore,
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      questionStore,
      blockageStore,
      journalStore,
      wikiStore: undefined,
      postActionStore: undefined,
      refusalStore: new RefusalStore(db),
      config,
    };
    context = ctx;
    return { ctx, config, root, workspaceRoot };
  }

  /**
   * A healthy instance, as the suite's prereq describes one: a container with an **accountable lead**, a
   * linked checkout that really exists on disk, and a CI workflow in it. The last part is what makes the
   * phantom-foundation bullet checkable at all — *"no 'your repository has no CI' when a CI workflow
   * exists"* is only a measurement if a CI workflow exists.
   */
  function withHealthyProject(ctx: KampakuToolContext, root: string) {
    const checkout = join(root, "intent-demo");
    mkdirSync(join(checkout, ".github", "workflows"), { recursive: true });
    writeFileSync(join(checkout, ".github", "workflows", "ci.yml"), "name: ci\non: [push]\n");
    writeFileSync(join(checkout, "README.md"), "# intent-demo\n");
    writeFileSync(join(checkout, "Makefile"), "test:\n\tpython3 -m unittest\n");

    const lead = ctx.agentStore.createSubAgent({
      slug: "intent-demo-lead",
      name: "Intent Demo Lead",
      responsibilities: "Own the intent-demo work order",
      systemPrompt: "You lead intent-demo.",
      parentId: ctx.agentStore.getKampakuAgent().id,
    });
    const now = new Date().toISOString();
    const project = ctx.store.createProject({
      id: "55555555-5555-4555-8555-555555555555",
      slug: "intent-demo",
      name: "Intent Demo",
      status: "active",
      projectLeadAgentId: lead.id,
      repositories: [{ url: `file://${checkout}`, role: "core", defaultBranch: "main" }],
      createdAt: now,
      updatedAt: now,
    });
    return { checkout, lead, project };
  }

  /** The board, in the only currency that counts: every work item in the instance. */
  function boardSize(ctx: KampakuToolContext): number {
    return ctx.pmStore.listAllWorkItems().length;
  }

  /**
   * Box 1 and the durable-clarification clause. "Start now" is not an approved scope: the reply asks which
   * improvement the emperor wants, the question reaches the durable store, it is answerable, and no track
   * is opened on the way.
   */
  it("turns a vague request into a durable, answerable clarify — and opens nothing", async () => {
    const { ctx, config, root } = setup();
    const { project } = withHealthyProject(ctx, root);
    const agentsBefore = ctx.agentStore.listAllAgents().length;
    const projectsBefore = ctx.store.listProjects().length;

    mockBroker.chatWithTools.mockResolvedValueOnce(assistantSaying(clarifyReply()));

    // The conversation is about this container, which is what `kampaku chat --project-id` does. The question
    // is recorded against it, so it is the *project's* gate and not a free-floating note.
    await runKampakuChat(
      ctx,
      config,
      { message: "Improve the project. Make it better. Start now.", projectId: project.id },
    );

    // 1. The clarify is durable, required, and carries the concrete options the operator must choose from.
    const pending = ctx.questionStore!.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].projectId).toBe(project.id);
    expect(pending[0].question).toContain("Which improvement do you want first");
    expect(pending[0].question).toContain("test coverage");

    // 2. It is readable on the surfaces the operator uses — REST, and the CLI's own client against the same
    //    core. A gate that cannot be read is not a gate.
    const { createApp } = await import("../../src/api/app.js");
    const app = createApp(
      ctx.store,
      config,
      ctx.agentStore,
      ctx.pmStore,
      ctx.conversationStore,
      ctx.skillStore,
      ctx.questionStore,
      ctx.memoryStore,
      ctx.blockageStore,
      ctx.journalStore,
      ctx.wikiStore,
      undefined,
      ctx.postActionStore,
      ctx.refusalStore,
    );
    const rest = (await (await app.request("/api/v1/questions")).json()) as {
      questions: Array<{ id: string; question: string; status: string }>;
    };
    expect(rest.questions).toHaveLength(1);
    expect(rest.questions[0].question).toBe(pending[0].question);

    const { CoreClient } = await import("../../src/client/core-client.js");
    const client = new CoreClient({
      baseUrl: "http://test",
      fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
        app.request(
          (typeof input === "string" ? input : input.toString()).replace("http://test", ""),
          init,
        )) as typeof fetch,
    });
    const fromCli = await client.listQuestions();
    expect(fromCli).toHaveLength(1);
    expect(fromCli[0].id).toBe(rest.questions[0].id);

    // 3. And it is **answerable**, which is the half that makes it a gate rather than a record.
    await client.answerQuestion(rest.questions[0].id, "test coverage");
    expect(ctx.questionStore!.listPending()).toHaveLength(0);

    // 4. Nothing was opened on the way: no container, no seat, no track. "Start now" did not authorise work.
    expect(ctx.store.listProjects()).toHaveLength(projectsBefore);
    expect(ctx.agentStore.listAllAgents()).toHaveLength(agentsBefore);
    expect(boardSize(ctx)).toBe(0);
  });

  /**
   * The overflow clause, measured the way suite 04's oracle prescribes: **by attempting the operation**.
   *
   * The front office holds no work-item tool, so a flood from chat means the model named a tool the role
   * does not hold and something ran it. That is exactly BOARD F-044's defect, and this is its second
   * instance: the tools that would turn "make it better" into twenty tracks are `update_work_item` and
   * `execute_work_item`. The board must be unchanged after the turn, and the model must be told why.
   */
  it("does not let a vague turn fan out through tools the front office does not hold", async () => {
    const { ctx, config, root } = setup();
    const { project } = withHealthyProject(ctx, root);

    mockBroker.chatWithTools
      .mockResolvedValueOnce(
        assistantCallingMany([
          {
            name: "update_work_item",
            args: { work_item_id: "00000000-0000-4000-8000-0000000000ff", status: "in_progress" },
          },
          {
            name: "execute_work_item",
            args: { work_item_id: "00000000-0000-4000-8000-0000000000ff" },
          },
        ]),
      )
      .mockResolvedValueOnce(assistantSaying(clarifyReply()));

    await runKampakuChat(ctx, config, "Improve the project. Make it better. Start now.");

    // 1. The board did not move. This is the suite's own bullet, in the only currency that counts.
    expect(boardSize(ctx)).toBe(0);

    // 2. The model was told the call was refused, by name. A refusal the caller cannot see is the silent
    //    failure this whole file exists to remove.
    expect(mockBroker.chatWithTools.mock.calls.length).toBeGreaterThanOrEqual(2);
    const results = toolResultsSeenByModel();
    expect(results).toContain("update_work_item");
    expect(results).toContain("execute_work_item");
    expect(results).toMatch(/is not in the front office's toolset/);

    // 3. And the refusal did not swallow the turn: the clarify that the same turn ends with is still durable.
    expect(ctx.questionStore!.listPending()).toHaveLength(1);
  });

  /**
   * The healthy-instance clause, checked against disk and the stores rather than against the reply: a
   * container that already has a lead, a linked checkout and a CI workflow gains nothing from a vague turn.
   * No imaginary onboarding, no re-initialised repository, no invented foundation track.
   */
  it("invents nothing on a healthy instance — no container, no seat, no track, no file", async () => {
    const { ctx, config, root, workspaceRoot } = setup();
    const { project, checkout } = withHealthyProject(ctx, root);
    const projectsBefore = ctx.store.listProjects().length;
    const agentsBefore = ctx.agentStore.listAllAgents();
    const checkoutBefore = readdirSync(checkout).sort();
    const workspaceBefore = readdirSync(workspaceRoot).sort();

    mockBroker.chatWithTools.mockResolvedValueOnce(assistantSaying(clarifyReply()));

    await runKampakuChat(ctx, config, "What must I decide right now?");

    expect(ctx.store.listProjects()).toHaveLength(projectsBefore);
    expect(ctx.agentStore.listAllAgents().map((agent) => agent.slug).sort()).toEqual(
      agentsBefore.map((agent) => agent.slug).sort(),
    );
    expect(boardSize(ctx)).toBe(0);
    // The linked checkout is untouched — the factory did not "set up" a repository that is already there.
    expect(readdirSync(checkout).sort()).toEqual(checkoutBefore);
    expect(readdirSync(workspaceRoot).sort()).toEqual(workspaceBefore);
    // And the CI workflow the instance already had is still the one on disk.
    expect(readdirSync(join(checkout, ".github", "workflows"))).toEqual(["ci.yml"]);
  });
});

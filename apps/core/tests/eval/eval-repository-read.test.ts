import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
import { KAMPAKU_BUILTIN_ID } from "../../src/agents/definitions.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";
import {
  MAX_FILE_CHARS,
  MAX_LIST_DEPTH,
  executeReadRepository,
  resolveCheckout,
} from "../../src/agents/runtime/tools/read-repository.js";

/**
 * Suite 05's **F-045** lock: the role that must staff and plan a project can read the project.
 *
 * Measured 2026-09-25 in the suite-05 run, a container's own lead answered *"How should I explore the
 * repository at file:///tmp/intent-demo? I don't have a direct file-reading tool available"* — twice — while
 * the front office's prompt told it to *"Read the repository before naming anyone: its manifests, CI, and
 * directory layout say what the work is"*. A factory that cannot read the thing it was asked to improve can
 * only ask the emperor to describe it, which is why a vague request produced questions about the product
 * rather than about the work.
 *
 * What is locked here is not "a read tool exists". It is the three properties that make it safe to give one
 * to an autonomous agent: it stays inside the project's own checkout, it says the content is untrusted, and
 * it states what it withheld instead of truncating in silence. The negative cases matter as much as the
 * positive ones — a reader that will open any path is a filesystem-exfiltration tool.
 */

describe("eval 05 — an agent can read the project's own repository, and only that", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  /** A checkout with a manifest, a CI workflow, a secret, and a directory the reader should skip. */
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "kampaku-eval-05-read-"));
    dataDir = root;
    const workspaceRoot = join(root, "workspace");
    const checkout = join(root, "intent-demo");
    const outside = join(root, "outside");
    mkdirSync(join(checkout, ".github", "workflows"), { recursive: true });
    mkdirSync(join(checkout, "intent_demo"), { recursive: true });
    mkdirSync(join(checkout, "node_modules", "left-pad"), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(checkout, "README.md"), "# intent-demo\nA Python order intake service.\n");
    writeFileSync(join(checkout, "Makefile"), "test:\n\tpython3 -m unittest\n");
    writeFileSync(join(checkout, ".github", "workflows", "ci.yml"), "name: ci\non: [push]\n");
    writeFileSync(join(checkout, "intent_demo", "service.py"), "class OrderService:\n    pass\n");
    writeFileSync(join(checkout, ".env"), "SECRET=should-not-be-listed\n");
    writeFileSync(join(outside, "secret.txt"), "the host's business\n");

    const config = loadConfig({
      dataDir: join(root, "data"),
      dbPath: join(root, "data", "kampaku.db"),
      workspaceRoot,
      agentMode: "llm",
      plannerMode: "llm",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const pmStore = new PmStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const ctx: KampakuToolContext = {
      store,
      agentStore,
      conversationStore: new ConversationStore(db),
      pmStore,
      skillStore: new SkillStore(db),
      memoryStore: new MemoryStore(db),
      questionStore: new QuestionStore(db, agentStore, pmStore),
      blockageStore: new BlockageStore(db, agentStore, pmStore),
      journalStore,
      wikiStore: undefined,
      postActionStore: undefined,
      refusalStore: new RefusalStore(db),
      config,
    };
    const lead = agentStore.createSubAgent({
      slug: "reader-lead",
      name: "Reader Lead",
      responsibilities: "Own the work order",
      systemPrompt: "You lead.",
      parentId: KAMPAKU_BUILTIN_ID,
    });
    const now = new Date().toISOString();
    const project = store.createProject({
      id: "44444444-4444-4444-8444-444444444444",
      slug: "intent-demo",
      name: "Intent Demo",
      status: "planning",
      projectLeadAgentId: lead.id,
      repositories: [{ url: `file://${checkout}`, role: "core", defaultBranch: "main" }],
      createdAt: now,
      updatedAt: now,
    });
    return { ctx, checkout, outside, project };
  }

  it("lists the checkout, so the aspects come from the repository", () => {
    const { ctx } = setup();

    const listing = executeReadRepository(ctx, { project_slug_or_id: "intent-demo" });

    const names = (listing.entries ?? []).map((entry) => entry.name);
    expect(names).toContain("README.md");
    expect(names).toContain("Makefile");
    expect(names).toContain("intent_demo/service.py");
    expect(names).toContain(".github/workflows/ci.yml");
    // Build output and credentials are not listed: the first is not content, the second is not ours to hand
    // to a model. Neither omission is silent — the notice names the rule.
    expect(names.some((name) => name.includes("node_modules"))).toBe(false);
    expect(names.some((name) => name.includes(".env"))).toBe(false);
    expect(listing.notice).toMatch(/not listed by design/i);
    // And every result says what it is: untrusted data, never instructions.
    expect(listing.trust).toMatch(/untrusted project content/i);
    expect(listing.trust).toMatch(/never instructions/i);
  });

  it("reads a file's text, and says how much it withheld rather than cutting in silence", () => {
    const { ctx } = setup();

    const read = executeReadRepository(ctx, {
      project_slug_or_id: "intent-demo",
      path: "Makefile",
    });
    expect(read.kind).toBe("file");
    expect(read.text).toContain("python3 -m unittest");

    // A file larger than the bound is cut **and the cut is stated**, because a partial file read as a whole
    // one is the defect the factory exists to prevent.
    const bigName = "intent_demo/huge.py";
    writeFileSync(join(ctx.config.workspaceRoot, "..", "intent-demo", bigName), "x".repeat(MAX_FILE_CHARS + 500));
    const cut = executeReadRepository(ctx, { project_slug_or_id: "intent-demo", path: bigName });
    expect(cut.text).toHaveLength(MAX_FILE_CHARS);
    expect(cut.textWithheldChars).toBe(500);
    expect(cut.notice).toMatch(/withheld/i);
    expect(cut.notice).toMatch(/not.*complete/i);
  });

  it("refuses every path outside the project's own checkout", () => {
    const { ctx, outside } = setup();

    // `..` cannot walk out of the checkout: the guard compares the **resolved** pair.
    expect(() =>
      executeReadRepository(ctx, { project_slug_or_id: "intent-demo", path: "../outside/secret.txt" }),
    ).toThrow(/outside the project's checkout/i);

    // An absolute path to a real file on this host is refused the same way. This is the difference between
    // a repository reader and a filesystem-exfiltration tool.
    expect(() =>
      executeReadRepository(ctx, { project_slug_or_id: "intent-demo", path: join(outside, "secret.txt") }),
    ).toThrow(/outside the project's checkout/i);

    // The guard is on the resolved pair, so it holds for a path that only *looks* contained too.
    expect(() => resolveCheckout("/checkout", "../etc/passwd")).toThrow(/outside the project's checkout/i);
    expect(resolveCheckout("/checkout", "src/app.py").relative).toBe("src/app.py");
    expect(MAX_LIST_DEPTH).toBeGreaterThan(0);
  });

  it("tells the truth when there is nothing to read", () => {
    const { ctx, project } = setup();

    // A path that does not exist is named as such, with the next step, rather than read as an empty file.
    expect(() =>
      executeReadRepository(ctx, { project_slug_or_id: "intent-demo", path: "nope.txt" }),
    ).toThrow(/does not exist in intent-demo's checkout/i);
    expect(() => executeReadRepository(ctx, { project_slug_or_id: "no-such-project" })).toThrow(/not found/i);

    // A container that links no **local** checkout: the refusal names the reason instead of returning an
    // empty listing, which a reader would take for "the repository is empty".
    ctx.store.updateProject(project.id, {
      repositories: [{ url: "https://example.invalid/x.git", role: "core" }],
    });
    expect(() => executeReadRepository(ctx, { project_slug_or_id: "intent-demo" })).toThrow(
      /links no local repository checkout/i,
    );
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ensureLeafSplitWorkItem, isOverweightLeaf } from "../../src/application/pm/leaf-splitter.js";
import { inferRequiredChecksFromWorkItem } from "../../src/application/pm/work-item-checks.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";
import { extractImpliedFilePaths } from "../../src/delegator/plan-validation.js";

/**
 * Locks for BOARD F-086 — the deterministic leaf splitter wrote npm criteria into a Python repository.
 *
 * The three defects, each measured on suite 08's re-run (run `s08r8`) and each locked here:
 *
 * 1. `applyDeterministicLeafSplit` wrote `npm test succeeds when package.json defines a test script` as a
 *    child's acceptance criterion in a checkout with a `Makefile` and no `package.json`.
 * 2. The sentence it wrote matched the npm detector, so the child was overweight in turn and a second pass
 *    wrote `npm run test succeeds`.
 * 3. An unordered extension alternation parsed `package.json` as `package.js`, and the grandchild required
 *    `file exists at package.js`.
 *
 * The rule these tests hold: the file budget is read from the leaf's **own scope**, the check criteria come
 * from the **linked checkout**, and a criterion no tool in that repository can decide is never written.
 */
describe("leaf splitter — criteria come from the project's own toolchain (F-086)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  /** A Makefile-wrapped Python checkout, shaped like suite 08's fixture. */
  function pythonCheckout(): string {
    const root = tempDir("kampaku-f086-py-");
    mkdirSync(join(root, "src", "pkg"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      join(root, "Makefile"),
      "check:\n\tpython3 -m unittest discover -s tests -t . -v\n\nlint:\n\tpython3 -m compileall -q src tests\n",
    );
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname = \"pkg\"\n");
    return root;
  }

  /** A Node checkout that declares its own scripts. */
  function nodeCheckout(): string {
    const root = tempDir("kampaku-f086-node-");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest run", lint: "eslint ." } }),
    );
    return root;
  }

  type Item = { title: string; description: string; acceptanceCriteria: string[] };

  /** Four paths in the leaf's own scope: over the file budget, so the splitter has work to do. */
  const overBudgetLeaf: Item = {
    title: "A1: implement pkg.cli with a count subcommand",
    description:
      "Owning leaf for `src/pkg/cli.py`, `tests/test_cli.py`, `src/pkg/words.py` and `tests/test_words.py`. " +
      "Create the CLI module with an argparse `count` subcommand and plain tab-separated rendering, per the " +
      "project's own contract document, leaving the pre-existing tests green and the tokenizer reusable.",
    acceptanceCriteria: ["make check exits 0 and its output shows every test as `ok`."],
  };

  /**
   * The measured shape of the leaf that was split for no reason: five planner-written criteria cite four
   * paths — one of them named precisely so the criterion can forbid duplicating it — while the leaf's own
   * scope names three.
   */
  const mentionOnlyLeaf: Item = {
    title: "A1: implement pkg.cli with a count subcommand",
    description:
      "Owning leaf for `src/pkg/cli.py` and `tests/test_cli.py`. Create the CLI module with an argparse " +
      "`count` subcommand and plain tab-separated rendering, per the project's own contract document, and " +
      "keep the pre-existing tests in `tests/test_words.py` green.",
    acceptanceCriteria: [
      "make check exits 0 and its output shows the pre-existing tests in tests/test_words.py as `ok`.",
      "tests/test_cli.py asserts the exact stdout string for main([\"count\", \"one two one\"]).",
      "src/pkg/cli.py delegates tokenization to pkg.words.count_words (no duplicated regex).",
      "src/pkg/words.py is unchanged by this leaf.",
    ],
  };

  function setup(checkout: string | undefined, item: Item) {
    const dataDir = tempDir("kampaku-f086-data-");
    const { db } = createDb(join(dataDir, "t.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const project = createProject(store, {
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: checkout ? [{ url: `file://${checkout}`, role: "core" }] : [],
    });
    const now = new Date().toISOString();
    const workItem = pmStore.createWorkItem({
      id: uuidv4(),
      projectId: project.id,
      ...item,
      status: "todo",
      priority: 0,
      sortOrder: 0,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });
    return { store, pmStore, agentStore, project, workItem };
  }

  function splitAndRead(checkout: string | undefined, item: Item) {
    const ctx = setup(checkout, item);
    ensureLeafSplitWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, ctx.workItem);
    const children = ctx.pmStore
      .listWorkItemsByProject(ctx.project.id)
      .filter((row) => row.parentId === ctx.workItem.id);
    return { ...ctx, children };
  }

  it("gives a Python checkout's children the checkout's own check, never npm", () => {
    const { children } = splitAndRead(pythonCheckout(), overBudgetLeaf);

    expect(children.length).toBeGreaterThanOrEqual(2);
    for (const child of children) {
      const criteria = child.acceptanceCriteria ?? [];
      expect(criteria.join("\n")).not.toMatch(/npm/i);
      expect(criteria.join("\n")).not.toContain("package.json");
      // Whatever else it carries, a child carries a criterion the runner can decide — and the runner
      // resolves the check name `test` against this very checkout, where it is `make check`.
      expect(inferRequiredChecksFromWorkItem({
        title: child.title,
        description: child.description,
        acceptanceCriteria: criteria,
      })).toContain("test");
      expect(criteria.some((criterion) => criterion.includes("make check"))).toBe(true);
      expect(isOverweightLeaf(child)).toBe(false);
    }
    expect(children.map((child) => child.acceptanceCriteria ?? []).join("\n")).toContain("make check");
  });

  it("gives a Node checkout's children its own scripts", () => {
    const { children } = splitAndRead(nodeCheckout(), overBudgetLeaf);

    const criteria = children.map((child) => (child.acceptanceCriteria ?? []).join("\n")).join("\n");
    expect(criteria).toContain("npm run test");
    expect(criteria).not.toContain("make check");
    for (const child of children) expect(isOverweightLeaf(child)).toBe(false);
  });

  it("does not split a leaf for the paths its criteria merely mention", () => {
    const { children, pmStore, project, workItem } = splitAndRead(pythonCheckout(), mentionOnlyLeaf);

    expect(isOverweightLeaf(workItem)).toBe(false);
    expect(children).toHaveLength(0);
    expect(
      pmStore.listWorkItemsByProject(project.id).some((row) => row.routingReason?.startsWith("leaf_split:")),
    ).toBe(false);
  });

  it("keeps the leaf's own decidable criterion when the checkout declares no check", () => {
    // A checkout that **declares no check** is a directory whose contents declare none — and that has to
    // be built deliberately. An empty directory is not one: `createProject` seeds an empty checkout, and
    // since 2026-10-01 that seed writes a `Makefile` with a `check` target (BOARD F-003), so an empty
    // directory arrives declaring `make check`. A checkout holding a README and nothing else is what the
    // case is about: brownfield respect means the seed leaves it exactly as it is.
    const empty = tempDir("kampaku-f086-empty-");
    writeFileSync(join(empty, "README.md"), "# demo\n\nNo commands yet.\n");
    const { children } = splitAndRead(empty, {
      ...overBudgetLeaf,
      acceptanceCriteria: ["pytest exits 0."],
    });

    expect(children.length).toBeGreaterThanOrEqual(2);
    for (const child of children) {
      // Nothing is invented for a checkout that declares no check: the leaf's own decidable criterion stays.
      expect(child.acceptanceCriteria ?? []).toContain("pytest exits 0.");
      expect((child.acceptanceCriteria ?? []).join("\n")).not.toMatch(/npm/i);
    }
  });

  it("never writes a criterion naming a file that cannot exist", () => {
    const { children } = splitAndRead(pythonCheckout(), {
      ...overBudgetLeaf,
      description:
        "Touch `src/pkg/report.py`, `src/pkg/missing/emit.py`, `src/pkg/cli.py` and `tests/test_report.py` to " +
        "wire the report into the CLI, with full context, repository conventions and verification notes for a " +
        "worker that has never seen this checkout.",
    });

    const criteria = children.map((child) => (child.acceptanceCriteria ?? []).join("\n")).join("\n");
    // `src/pkg/missing/` does not exist in the checkout, so no criterion may demand a file inside it.
    expect(criteria).not.toContain("file exists at src/pkg/missing/emit.py");
    expect(criteria).not.toContain("package.js");
  });

  it("parses package.json whole — the extension a criterion writes is never truncated", () => {
    expect(extractImpliedFilePaths("npm test succeeds when package.json defines a test script")).toEqual([
      "package.json",
    ]);
    expect(
      extractImpliedFilePaths("`make check` is declared in `Makefile` and run by `.github/workflows/ci.yml`"),
    ).toEqual([".github/workflows/ci.yml"]);
  });

  it("does not split its own children: a second pass adds nothing", () => {
    const ctx = splitAndRead(pythonCheckout(), overBudgetLeaf);
    const before = ctx.pmStore.listWorkItemsByProject(ctx.project.id).length;
    for (const child of ctx.children) {
      ensureLeafSplitWorkItem(ctx.pmStore, ctx.agentStore, ctx.store, child);
    }
    expect(ctx.pmStore.listWorkItemsByProject(ctx.project.id)).toHaveLength(before);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { ensureLeafSplitWorkItem } from "../../src/application/pm/leaf-splitter.js";
import { requiredPassingChecksFor } from "../../src/application/pm/leaf-checks.js";
import { createProject } from "../../src/application/projects.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * **A slice is never handed a gate its siblings exist to satisfy.**
 *
 * Measured 2026-11-08 on suite 19 run `s19r9`, on the legacy checkout whose only runner is `run-tests.sh` looping
 * `checks/test_parse.py` and `checks/test_totals.py`:
 *
 * 1. the plan's first repair leaf carried `./run-tests.sh exits 0` — the whole suite, of which one check is this
 *    leaf's own defect and the other is its sibling's;
 * 2. the leaf went over budget and the splitter cut it;
 * 3. every slice inherited the **aggregate**, so each slice was asked to make the whole suite green while the
 *    sibling's defect was still in the file. No slice could close, the leafs above them could not either, and the
 *    only way out was an operator merging the two repairs by hand — which is what the run did, twice.
 *
 * The rule this locks: the aggregate keeps exactly one owner, the leaf whose *only* check it is (the verification
 * leaf). A leaf that names both an aggregate and a member hands its slices the member. A leaf with one check and no
 * member keeps what it has, so nothing else changes shape.
 */
describe("leaf splitter — a slice proves its own check, not the whole suite (suite 19 / s19r9)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  /** The legacy checkout: one runner, two checks inside it, both mode 644 and run through `python3`. */
  function legacyCheckout(): string {
    const root = tempDir("kampaku-s19-split-");
    mkdirSync(join(root, "checks"), { recursive: true });
    mkdirSync(join(root, "src", "ledger"), { recursive: true });
    writeFileSync(join(root, "src", "ledger", "__init__.py"), "");
    writeFileSync(join(root, "checks", "test_parse.py"), "assert True\n");
    writeFileSync(join(root, "checks", "test_totals.py"), "assert True\n");
    writeFileSync(
      join(root, "run-tests.sh"),
      '#!/bin/sh\nfor check in checks/test_*.py; do\n    PYTHONPATH=src python3 "$check" || exit 1\ndone\n',
      { mode: 0o755 },
    );
    return root;
  }

  type Item = { title: string; description: string; acceptanceCriteria: string[] };

  /** Over the file budget (four paths in scope) and carrying the aggregate plus its own member. */
  const repairLeaf: Item = {
    title: "Repair D1: skip comment lines in parse_lines",
    description:
      "Owning leaf for `src/ledger/parse.py`, `src/ledger/__init__.py`, `src/ledger/totals.py` and " +
      "`CONTRIBUTING.md`. Skip comment lines in parse_lines and keep everything else as it is.",
    acceptanceCriteria: [
      "`PYTHONPATH=src python3 checks/test_parse.py` exits 0.",
      "`./run-tests.sh` exits 0.",
      "`git status --short` names only src/ledger/parse.py.",
    ],
  };

  /** The verification leaf: the aggregate is all it names, so the aggregate is what it must prove. */
  const verificationLeaf: Item = {
    title: "Verify the checkout with ./run-tests.sh",
    description:
      "Owning leaf for `src/ledger/parse.py`, `src/ledger/totals.py`, `src/ledger/__init__.py` and " +
      "`CONTRIBUTING.md`. Run the checkout's own runner and record it.",
    acceptanceCriteria: ["`./run-tests.sh` exits 0 and both checks print ok."],
  };

  function splitAndRead(checkout: string, item: Item) {
    const dataDir = tempDir("kampaku-s19-split-data-");
    const { db } = createDb(join(dataDir, "t.db"));
    const store = new Store(db);
    const pmStore = new PmStore(db);
    const agentStore = new AgentStore(db);
    const project = createProject(store, {
      slug: "legacy-ledger",
      name: "legacy-ledger",
      status: "active",
      repositories: [{ url: `file://${checkout}`, role: "core" }],
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
    ensureLeafSplitWorkItem(pmStore, agentStore, store, workItem);
    // The slices a split writes, wherever they hang: the split item sits where the leaf did, its slices beneath it.
    const children = pmStore
      .listWorkItemsByProject(project.id)
      .filter((row) => row.routingReason?.startsWith("split_of:"));
    return { children, checkout };
  }

  it("hands a repair leaf's slices the member check, not the aggregate its sibling is needed for", () => {
    const { children, checkout } = splitAndRead(legacyCheckout(), repairLeaf);
    expect(children.length).toBeGreaterThanOrEqual(2);

    for (const slice of children) {
      const checks = requiredPassingChecksFor(
        { title: slice.title, description: slice.description, acceptanceCriteria: slice.acceptanceCriteria },
        checkout,
      );
      // The measured deadlock, stated as the assertion: no slice may be judged on the whole suite.
      expect(checks, `${slice.title}: ${(slice.acceptanceCriteria ?? []).join(" | ")}`).not.toContain("test");
      expect(checks).toContain("checks/test_parse.py");
    }
  });

  it("leaves the aggregate to the verification leaf, which names nothing else", () => {
    const { children, checkout } = splitAndRead(legacyCheckout(), verificationLeaf);
    expect(children.length).toBeGreaterThanOrEqual(2);

    // Every slice of the verification leaf is still asked to prove the runner: that leaf is the gate, and a gate
    // split into slices that each prove less would be no gate at all.
    for (const slice of children) {
      expect(
        requiredPassingChecksFor(
          { title: slice.title, description: slice.description, acceptanceCriteria: slice.acceptanceCriteria },
          checkout,
        ),
      ).toEqual(["test"]);
    }
  });

  it("keeps the control: a leaf with one check and no member keeps exactly that check", () => {
    const root = tempDir("kampaku-s19-split-plain-");
    writeFileSync(join(root, "Makefile"), "check:\n\t@true\n");
    const { children } = splitAndRead(root, {
      ...repairLeaf,
      acceptanceCriteria: ["`make check` exits 0."],
    });
    expect(children.length).toBeGreaterThanOrEqual(1);
    for (const slice of children) {
      expect((slice.acceptanceCriteria ?? []).join("\n")).toContain("make check");
    }
  });
});

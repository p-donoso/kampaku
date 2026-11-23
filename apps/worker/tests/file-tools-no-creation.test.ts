import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCodingTool, forbidsNewPaths } from "../src/tools/file-tools.js";

/**
 * **A work item whose own criteria say the checkout gains no path is not allowed to gain one.**
 *
 * Measured 2026-11-12 on suite 19's ninth run, `s19r18`. Four leaves wrote a `journal.md` into the checkout —
 * `LL-1.2/`, `LL-1.4/`, `LL-2.1/`, `LL-2.2/` — and each of them carried a criterion that says the opposite:
 * `LL-1.2` *"No file in the checkout was created, modified, moved or deleted; git -C . status --porcelain after
 * the run is empty"*, `LL-2.1` *"no new path appears in git -C . status --porcelain"*, `LL-2.2` *"do not create
 * any file"*. The leaves were not wrong about the rule; nothing enforced it. `LL-1.2/journal.md` even opens by
 * stating that it changed nothing in the tree, which is the file disagreeing with itself.
 *
 * The reason a file was the only possible answer is the second half of the defect: the criteria say *"Journal
 * contains …"*, because the plan uses the product's own word, and the worker has no journal to write to — so the
 * platform's journal became a directory named `journal`. The record already exists on the platform side: the
 * job's summary is persisted as the work-item journal entry (`recordCompletionReportJournal`). So the boundary
 * refuses the created path and the refusal names the summary as the place the record goes.
 *
 * The rule is about **creating**, not about writing: `LL-2.1` has to edit `src/ledger/parse.py`, and editing an
 * existing file is what its criteria allow. Only a path that does not exist yet is refused, and only when the
 * work item's own words forbid new paths — silence keeps the old behaviour, which the control case states.
 */
describe("a checkout whose criteria admit no new path (suite 19 / F-148)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-no-creation-"));
    writeFileSync(join(root, "README.rst"), "Ledger\n");
    writeFileSync(join(root, "parse.py"), "def parse_lines(text):\n    return []\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the criteria that say it, and not the ones that only ask for work", () => {
    // The four measured criteria, verbatim.
    expect(
      forbidsNewPaths(
        "No file in the checkout was created, modified, moved or deleted; git -C . status --porcelain after the run is empty.",
      ),
    ).toBe(true);
    expect(
      forbidsNewPaths("git -C . diff for this leaf touches only src/ledger/parse.py, and no new path appears in git -C . status --porcelain."),
    ).toBe(true);
    expect(forbidsNewPaths("Do not touch checks/, run-tests.sh, tools/, and do not create any file.")).toBe(true);
    expect(
      forbidsNewPaths("The maintenance record must never be written as a new file in the checkout."),
    ).toBe(true);

    // Controls: a criterion that asks for work, and silence, are not this rule.
    expect(forbidsNewPaths("`./run-tests.sh` exits 0 and prints its ok line.")).toBe(false);
    expect(forbidsNewPaths("Write the CLI contract document at docs/cli.md.")).toBe(false);
  });

  it("refuses the created path and names the summary as where the record goes", async () => {
    await expect(
      executeCodingTool("write_file", { path: "LL-1.2/journal.md", content: "# journal\n" }, root, {
        noNewPaths: true,
      }),
    ).rejects.toThrow(/may not create LL-1\.2\/journal\.md/);

    await expect(
      executeCodingTool("write_file", { path: "LL-2.1/journal.md", content: "# journal\n" }, root, {
        noNewPaths: true,
      }),
    ).rejects.toThrow(/work-item journal entry/);
  });

  it("keeps editing an existing file writable, and keeps a checkout without the rule writable", async () => {
    // LL-2.1's real work: an existing file, edited in place.
    await executeCodingTool("write_file", { path: "parse.py", content: "def parse_lines(text):\n    return ['a']\n" }, root, {
      noNewPaths: true,
    });
    expect(readFileSync(join(root, "parse.py"), "utf8")).toContain("'a'");

    // Control: no such criterion, so a job that must create a deliverable still creates it.
    await executeCodingTool("write_file", { path: "docs/cli.md", content: "# CLI\n" }, root, {});
    expect(readFileSync(join(root, "docs", "cli.md"), "utf8")).toBe("# CLI\n");
  });
});

/**
 * **A prohibition scoped to one subtree is not a ban on the whole checkout.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`, scenario M, job `3468fef3` — the eleventh dispatch of leaf
 * `8559c90f`. Its fifth criterion, verbatim:
 *
 * > [ac-5] The completion report states that no file under `packages/contract` was created, modified or deleted
 * > by this task.
 *
 * and its first two criteria require creating `packages/orders/src/summary.js` and
 * `packages/orders/test/summary.test.js`. The reading of "no file … created" ignored the subtree that scopes it,
 * so the job was told *"no new path may appear in the checkout"*, both deliverables were refused by
 * `assertCreationAllowed`, and the job was reported as having finished without writing — with the refusal's own
 * reason discarded. Eleven dispatches, checkout byte-identical.
 *
 * The scope is what makes the sentence a rule: a prohibition is about the object it names, which is the reading
 * `deriveFrozenPaths` already makes for a freeze (F-154).
 */
describe("a prohibition that names its own subtree (suite 19 / F-155)", () => {
  it("does not read a scoped prohibition as a checkout-wide ban", () => {
    // The measured criterion, verbatim.
    expect(
      forbidsNewPaths(
        "- [ac-5] The completion report states that no file under packages/contract was created, modified or deleted by this task.",
      ),
    ).toBe(false);
    expect(forbidsNewPaths("No file in packages/cli may be created or modified.")).toBe(false);
    expect(forbidsNewPaths("Do not create any file inside `packages/contract`.")).toBe(false);
    expect(forbidsNewPaths("Nothing under `packages/ids/` is created by this task.")).toBe(false);
  });

  it("still reads an unscoped prohibition, even beside a scoped one", () => {
    // The other eleven dispatches, and the four leaves F-148 measured: no subtree, so no narrowing.
    expect(forbidsNewPaths("No file in the checkout was created, modified, moved or deleted.")).toBe(true);
    expect(forbidsNewPaths("Do not create any file.")).toBe(true);
    expect(forbidsNewPaths("No file under packages/contract was created. Do not create any file.")).toBe(true);
    // `git -C .` is git's own flags, not the object the prohibition names, so this one still bans creation.
    expect(
      forbidsNewPaths(
        "git -C . diff for this leaf touches only src/ledger/parse.py, and no new path appears in git -C . status --porcelain.",
      ),
    ).toBe(true);
  });

  it("lets the measured leaf create the two files its criteria require", async () => {
    const root = mkdtempSync(join(tmpdir(), "kampaku-scoped-prohibition-"));
    try {
      mkdirSync(join(root, "packages", "orders", "src"), { recursive: true });
      mkdirSync(join(root, "packages", "contract"), { recursive: true });
      writeFileSync(join(root, "packages", "orders", "src", "index.js"), "export {};\n");
      await executeCodingTool(
        "write_file",
        { path: "packages/orders/src/summary.js", content: "export const summarizeOrder = () => ({});\n" },
        root,
        { noNewPaths: false },
      );
      expect(readFileSync(join(root, "packages", "orders", "src", "summary.js"), "utf8")).toContain("summarizeOrder");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

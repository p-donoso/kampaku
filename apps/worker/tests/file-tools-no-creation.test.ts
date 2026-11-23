import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

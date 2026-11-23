import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";

/**
 * **A job may not add a file to the root of a checkout it did not create.**
 *
 * Measured on suite 19, twice, on the legacy scenario — a Python checkout with `src/ledger/`, `checks/`,
 * a `run-tests.sh` and a `CONTRIBUTING.md` that forbids moving anything between directories:
 *
 * - `s19r1`: the job wrote `baseline-evidence.md` beside the checkout's `README.rst` while its own acceptance
 *   criterion read *"No file inside the checkout was created, modified or deleted by this task."*
 * - `s19r2`: after the check ran and both defects were proven, the job left `report-slice1-parse-comments.md`
 *   and `triage-824ca55d.md` at the same root, and the front office told the emperor *"no file has been added"*.
 *
 * The suite's first oracle bullet is that any file the factory creates is justified by the request, and the
 * request here was *"tell me what is broken, fix the smallest set of things"*. The report of a job belongs to
 * the job's own record; the checkout's root belongs to the repository's conventions.
 *
 * The rule is deliberately narrow, and the cases below are its boundary: a path with no directory part, a file
 * that does not exist yet, and only when the job states the paths its work item named.
 */
describe("a job's report does not land at the root of the checkout (suite 19)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-root-reports-"));
    writeFileSync(join(root, "README.rst"), "Ledger\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a root-level file the work item never named, and says where the report goes", async () => {
    await expect(
      executeCodingTool(
        "write_file",
        { path: "report-slice1-parse-comments.md", content: "# report\n" },
        root,
        { declaredPaths: ["src/ledger/parse.py", "checks/test_parse.py"] },
      ),
    ).rejects.toThrow(/may not add a new top-level entry "report-slice1-parse-comments\.md"/);

    // The refusal names the alternative, so a model can act on it instead of retrying the same write.
    await expect(
      executeCodingTool("write_file", { path: "triage-824ca55d.md", content: "x" }, root, {
        declaredPaths: ["src/ledger/parse.py"],
      }),
    ).rejects.toThrow(/Record the report in your summary/);
  });

  it("refuses a **directory** invented at the root, which is the same defect one shape over", async () => {
    // Measured in the same run: refused the root file, the job created `journal/` and wrote its notes there.
    await expect(
      executeCodingTool("write_file", { path: "journal/baseline.md", content: "notes\n" }, root, {
        declaredPaths: ["src/ledger/parse.py", "checks/test_parse.py"],
      }),
    ).rejects.toThrow(/may not add a new top-level entry "journal"/);
  });

  it("still writes the files the work item names, and anything inside a directory it works in", async () => {
    await executeCodingTool("write_file", { path: "src/ledger/parse.py", content: "ok\n" }, root, {
      declaredPaths: ["src/ledger/parse.py"],
    });
    expect(readFileSync(join(root, "src", "ledger", "parse.py"), "utf8")).toBe("ok\n");

    // A directory that already exists is the work item's own business: the top level is what the rule protects.
    mkdirSync(join(root, "docs"), { recursive: true });
    await executeCodingTool("write_file", { path: "docs/architecture/cli.md", content: "doc\n" }, root, {
      declaredPaths: ["src/ledger/parse.py"],
    });
    expect(readFileSync(join(root, "docs", "architecture", "cli.md"), "utf8")).toBe("doc\n");
  });

  it("keeps the control: a job that states no paths is not refused on a guess, and an existing file may be edited", async () => {
    await executeCodingTool("write_file", { path: "notes.md", content: "free\n" }, root);
    expect(readFileSync(join(root, "notes.md"), "utf8")).toBe("free\n");

    // An existing root file is not an addition to somebody's layout, so editing it stays allowed.
    await executeCodingTool("write_file", { path: "README.rst", content: "Ledger\n\nfixed\n" }, root, {
      declaredPaths: ["src/ledger/parse.py"],
    });
    expect(readFileSync(join(root, "README.rst"), "utf8")).toContain("fixed");
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";

/**
 * **Existing tests win — enforced where the write happens.**
 *
 * Suite 19's second oracle bullet says an existing check is not deleted, disabled or weakened. Until this file, that
 * was a rule in the suite rather than in the runtime, and it cost a run: measured 2026-11-08 on `s19r7`, asked to
 * repair `parse_lines` in a legacy checkout whose checks are `checks/test_parse.py` and `checks/test_totals.py`, a
 * job edited **`checks/test_parse.py`** — adding an indented-comment case and rewording the assertion message — so
 * the check agreed with the new code instead of the code satisfying the check, and the step reported success. The
 * repair was correct; the check was moved under it.
 *
 * The rule is the same shape as the two write rules beside it: name it or leave it. A work item that genuinely has
 * to change a check names it, and then the write is allowed — so a test-repair task stays possible.
 */
describe("a job may not modify the checkout's own checks (suite 19)", () => {
  let root: string;
  const protectedPaths = ["checks/test_parse.py", "checks/test_totals.py", "run-tests.sh"];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-protected-checks-"));
    mkdirSync(join(root, "checks"), { recursive: true });
    mkdirSync(join(root, "src", "ledger"), { recursive: true });
    writeFileSync(join(root, "checks", "test_parse.py"), "assert True\n", { mode: 0o755 });
    writeFileSync(join(root, "src", "ledger", "parse.py"), "def parse_lines(text):\n    return text\n");
    writeFileSync(join(root, "run-tests.sh"), "#!/bin/sh\n", { mode: 0o755 });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses the edit the run actually made, and names the way through", async () => {
    await expect(
      executeCodingTool(
        "replace_in_file",
        { path: "checks/test_parse.py", old_text: "assert True", new_text: "assert True  # relaxed" },
        root,
        { protectedPaths, declaredPaths: ["src/ledger/parse.py"] },
      ),
    ).rejects.toThrow(/Existing tests win/);
    expect(readFileSync(join(root, "checks", "test_parse.py"), "utf8")).toBe("assert True\n");

    await expect(
      executeCodingTool("write_file", { path: "checks/test_totals.py", content: "assert 1\n" }, root, {
        protectedPaths,
        declaredPaths: ["src/ledger/parse.py"],
      }),
    ).rejects.toThrow(/one of this checkout's own checks/);
  });

  it("lets the source fix through, which is where the repair belongs", async () => {
    await executeCodingTool(
      "replace_in_file",
      { path: "src/ledger/parse.py", old_text: "return text", new_text: "return [line for line in text.split('\\n') if line]" },
      root,
      { protectedPaths, declaredPaths: ["src/ledger/parse.py"] },
    );
    expect(readFileSync(join(root, "src", "ledger", "parse.py"), "utf8")).toContain("if line");
  });

  it("allows the write when the work item names the check: a test repair is real work", async () => {
    await executeCodingTool(
      "write_file",
      { path: "checks/test_parse.py", content: "assert 1 == 1\n" },
      root,
      { protectedPaths, declaredPaths: ["checks/test_parse.py"] },
    );
    expect(readFileSync(join(root, "checks", "test_parse.py"), "utf8")).toBe("assert 1 == 1\n");
  });

  it("keeps the controls: no protected set means nothing is refused, and a runner path is protected too", async () => {
    await executeCodingTool("write_file", { path: "checks/test_parse.py", content: "assert 2\n" }, root);
    expect(readFileSync(join(root, "checks", "test_parse.py"), "utf8")).toBe("assert 2\n");

    await expect(
      executeCodingTool("replace_in_file", { path: "run-tests.sh", old_text: "#!/bin/sh", new_text: "#!/bin/bash" }, root, {
        protectedPaths,
        declaredPaths: ["src/ledger/parse.py"],
      }),
    ).rejects.toThrow(/own checks/);
  });
});

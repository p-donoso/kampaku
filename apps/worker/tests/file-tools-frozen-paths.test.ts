import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPathNotFrozen, executeCodingTool } from "../src/tools/file-tools.js";

/**
 * The write that a plan froze must not land, whichever tool reaches for it.
 *
 * Measured 2026-10-04 on suite 08's fourth re-run (BOARD F-098). A job was told, in capitals, that two files
 * were frozen and that exactly one file was to change. It added a function back into a frozen module instead,
 * `make check` went green, and the platform reported success — because "do not touch this file" was a sentence
 * in a prompt and nothing else. The checks a job is measured against were all satisfiable that way.
 *
 * This is the boundary half of the rule: the file is not written, so there is nothing to notice or review.
 */
describe("a frozen path is refused at the write boundary", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "kampaku-frozen-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses write_file into a frozen path and leaves the file alone", async () => {
    writeFileSync(join(root, "words.py"), "PRistine\n");
    const frozen = ["src/words.py"];

    await expect(
      executeCodingTool("write_file", { path: "src/words.py", content: "rewritten\n" }, root, { frozenPaths: frozen }),
    ).rejects.toThrow(/plan freezes src\/words\.py/);

    expect(readFileSync(join(root, "words.py"), "utf8")).toBe("PRistine\n");
  });

  it("refuses replace_in_file into a frozen path", async () => {
    writeFileSync(join(root, "words.py"), "def words():\n    pass\n");
    await expect(
      executeCodingTool(
        "replace_in_file",
        { path: "words.py", old_text: "pass", new_text: "return []" },
        root,
        { frozenPaths: ["words.py"] },
      ),
    ).rejects.toThrow(/plan freezes words\.py/);
    expect(readFileSync(join(root, "words.py"), "utf8")).toContain("pass");
  });

  it("names the rule and the alternative, so the refusal is actionable rather than retried", async () => {
    await expect(
      executeCodingTool("write_file", { path: "tests/test_words.py", content: "x" }, root, {
        frozenPaths: ["tests/test_words.py"],
      }),
    ).rejects.toThrow(/report that as a blocker/);
  });

  it("still writes every path the plan did not freeze", async () => {
    await executeCodingTool("write_file", { path: "src/stats.py", content: "ok\n" }, root, {
      frozenPaths: ["words.py", "tests/test_words.py"],
    });
    expect(readFileSync(join(root, "src/stats.py"), "utf8")).toBe("ok\n");
  });

  it("writes freely when the job carries no freeze at all", async () => {
    // Every job in the platform before this change, and every job whose plan freezes nothing.
    await executeCodingTool("write_file", { path: "a.py", content: "ok\n" }, root);
    expect(readFileSync(join(root, "a.py"), "utf8")).toBe("ok\n");
    expect(() => assertPathNotFrozen("a.py", [])).not.toThrow();
  });

  it("matches the path as the plan wrote it, with or without a leading ./", async () => {
    await expect(
      executeCodingTool("write_file", { path: "./words.py", content: "x" }, root, { frozenPaths: ["words.py"] }),
    ).rejects.toThrow(/frozen/);
  });
});

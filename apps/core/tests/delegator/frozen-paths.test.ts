import { describe, expect, it } from "vitest";
import {
  deriveFrozenPaths,
  extractForbiddenFilePaths,
  extractImpliedFilePaths,
} from "../../src/delegator/plan-validation";

/**
 * A plan's freeze is the other half of its deliverable list, and it is stated in the same prose.
 *
 * Measured 2026-10-04 on suite 08's fourth re-run (BOARD F-098, F-099). The plan's working agreements froze
 * two files — "No change to `words.py` semantics or `WORD_RE`. `tests/test_words.py` is the existing contract
 * and must stay green unmodified" — and the sentence was read as a *deliverable* list, so the splitter handed
 * the slice those files as its touch scope and the job edited one of them back to make a failing check pass.
 * Nothing in the platform believed the freeze.
 *
 * Reading it once, deterministically, is what replaces re-reading it in every model turn.
 */
describe("the paths a plan freezes are the ones it names and does not ask for", () => {
  it("reads the plan's own freeze sentences", () => {
    expect(
      extractForbiddenFilePaths(
        "No change to `words.py` semantics or `WORD_RE`. " +
          "`tests/test_words.py` is the existing contract and must stay green unmodified. " +
          "Create `src/textstats/stats.py`.",
      ),
    ).toEqual(["words.py", "tests/test_words.py"]);
  });

  it("and the paths it asks for are exactly the complement", () => {
    const text =
      "Do not touch docs/architecture/cli.md, src/textstats/words.py or tests/test_words.py. " +
      "Add the ranking to src/textstats/stats.py.";
    expect(extractImpliedFilePaths(text)).toEqual(["src/textstats/stats.py"]);
    expect(extractForbiddenFilePaths(text)).toEqual([
      "docs/architecture/cli.md",
      "src/textstats/words.py",
      "tests/test_words.py",
    ]);
  });

  it("reads one sentence that asks for one file and forbids another", () => {
    // The reason this is decided per occurrence rather than per sentence: a reader that classifies the sentence
    // as a whole has to get one of the two paths wrong.
    expect(extractForbiddenFilePaths("Create stats.py and do not write tests.py.")).toEqual(["tests.py"]);
    expect(extractImpliedFilePaths("Create stats.py and do not write tests.py.")).toEqual(["stats.py"]);
  });

  it("keeps a path writable when the same text also asks for it", () => {
    // The deliverable wins, so a plan cannot freeze the very file it asks to be written.
    expect(extractForbiddenFilePaths("Create stats.py, then do not forget stats.py is the deliverable here.")).toEqual([]);
  });

  it("does not freeze a path that is merely mentioned", () => {
    // Over-freezing blocks legitimate work, which is worse than under-freezing: a plan nobody can follow gets
    // ignored, and the whole point is that the constraint is followed.
    expect(
      extractForbiddenFilePaths(
        "src/textstats/words.py exports count_words, and cli.py calls it. Add stats.py.",
      ),
    ).toEqual([]);
  });

  it("takes declared freezes whether or not the prose repeats them, and dedupes", () => {
    expect(
      deriveFrozenPaths({
        title: "Wire the stats subcommand",
        description: "Add the ranking to src/textstats/stats.py. Do not touch pyproject.toml.",
        acceptanceCriteria: ["make check exits 0"],
        declared: ["src/textstats/words.py", "pyproject.toml"],
      }),
    ).toEqual(["src/textstats/words.py", "pyproject.toml"]);
  });

  it("freezes nothing when the plan forbids nothing", () => {
    expect(deriveFrozenPaths({ title: "Write src/a.py", description: "Tests in tests/b.py." })).toEqual([]);
  });
});

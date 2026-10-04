import { describe, expect, it } from "vitest";
import { extractImpliedFilePaths, impliedDeliverablePaths } from "../../src/delegator/plan-validation";

/**
 * A path named in order to forbid it is not a deliverable.
 *
 * Measured 2026-10-04 on suite 08's fourth re-run (`s08r11`, BOARD F-099): the splitter derived a slice's
 * **touch scope** from its parent's freeze — the child was created with "a declared touch scope of
 * `src/textstats/words.py, tests/test_words.py, src/textstats/stats.py`", the first two being the files the
 * parent said must not be modified. The job that ran on it added `rank_words()` back into the frozen
 * `words.py`, `make check` went green, and the platform called it success.
 *
 * The cases below are the plan's own sentences from that run, which is what makes them worth locking rather
 * than inventing: they are the wording a planner actually wrote.
 */
describe("a path a text forbids is not a path it asks for", () => {
  it("drops the frozen module from the plan's own freeze sentences", () => {
    expect(
      impliedDeliverablePaths({
        title: "CLI contract and stats engine",
        description:
          "Leave `pyproject.toml` alone. No change to `words.py` semantics or `WORD_RE`. " +
          "`tests/test_words.py` is the existing contract and must stay green unmodified. " +
          "Create `src/textstats/stats.py`.",
      }),
    ).toEqual(["src/textstats/stats.py"]);
  });

  it("keeps a clause that asks for a path while mentioning a rule", () => {
    // The control: a prohibition vocabulary word in the same sentence must not swallow a deliverable.
    expect(
      extractImpliedFilePaths("Create src/textstats/stats.py and keep make lint green without new files."),
    ).toEqual(["src/textstats/stats.py"]);
  });

  it("reads clause by clause, so a positive clause beside a negative one survives", () => {
    expect(
      extractImpliedFilePaths("Touch only: src/a.py, tests/b.py. Do not edit src/c.py. Do not create src/d.ts."),
    ).toEqual(["src/a.py", "tests/b.py"]);
  });

  it("keeps every path when it recognises no prohibition, rather than guessing", () => {
    expect(extractImpliedFilePaths("Write src/one.py and tests/two.py.")).toEqual(["src/one.py", "tests/two.py"]);
  });

  it("keeps a folder-shaped prohibition out of the budget it would otherwise inflate", () => {
    // Three frozen paths used to be three deliverables, which is one over the file budget — so a leaf that
    // asked for nothing to be written was split for asking too much.
    const frozen =
      "Do not touch docs/architecture/cli.md, src/textstats/words.py or tests/test_words.py. " +
      "Add the ranking to src/textstats/stats.py.";
    expect(extractImpliedFilePaths(frozen)).toEqual(["src/textstats/stats.py"]);
  });
});

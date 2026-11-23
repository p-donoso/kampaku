import { describe, expect, it } from "vitest";
import { buildCompletionMessages } from "../../src/application/pm/completion-summary.js";

/**
 * **A leaf's report is not edited by the platform.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r30`. Leaf `1b073ce0`'s job wrote a 6 753-character report and the journal
 * kept 4 096, cutting it mid-heading (`### ac-4 / ac-5 — worki…`). Four of that leaf's seven acceptance criteria ask
 * what the report quotes about `git status`, `git diff`, the style audit and a grep — and all four sections were
 * written after the cut, so the report the operator read, and the report closure read, did not contain the answers.
 * Measured directly: `git status --porcelain`, `git diff -- src/ledger/parse.py`, the grep for the frozen signature
 * and the style audit were all present in `output.summary` and absent from the journal body.
 *
 * Two things are locked here: the bound is no longer 4 096, and a report that does get cut says so, naming how much
 * was dropped — an elision mark alone is read as "the leaf had nothing more to say".
 */
describe("the completion report the platform records (F-167)", () => {
  const LONG = Array.from({ length: 40 }, (_, index) => `## Section ${index + 1}\n\n` + "detail ".repeat(60)).join("\n\n");

  function build(summary: string) {
    return buildCompletionMessages(
      { title: "Skip comment lines in ledger.parse.parse_lines", acceptanceCriteria: ["ac-1"] },
      {
        jobId: "5f5f6c0b",
        leaseId: "lease-1",
        status: "succeeded",
        finishedAt: "2026-11-23T20:53:58.956Z",
        output: { summary, checkResults: { test: false }, filesChanged: ["src/ledger/parse.py"] },
      },
    );
  }

  it("keeps a report the size of the one s19r30 measured", () => {
    // 6 753 characters, the length that was cut.
    const summary = "## ac-4\n" + "x".repeat(6_700) + "\n### ac-7 — signature\n`def parse_lines(text)` still present verbatim";
    expect(summary.length).toBeGreaterThan(6_753);

    const messages = build(summary);
    expect(messages.journalBody).toContain("### ac-7 — signature");
    expect(messages.journalBody).toContain("`def parse_lines(text)` still present verbatim");
    expect(messages.journalBody).not.toContain("[report truncated");
  });

  it("states the cut when a report really is too long, instead of ending mid-sentence", () => {
    const messages = build(LONG + "\n\n" + LONG);
    expect(messages.journalBody).toContain("[report truncated:");
    expect(messages.journalBody).toContain("not recorded");
    // The bound is a bound: the record does not grow without one.
    expect(messages.journalBody.length).toBeLessThan(33_000);
  });
});

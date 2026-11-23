import { describe, expect, it } from "vitest";
import { buildDecomposeSystemPrompt } from "../../src/delegator/decompose-intent.js";
import { PLANNER_SYSTEM_PROMPT } from "../../src/planner/prompts.js";

/**
 * **The work and the record of the work are two asks, and a plan must not merge them.**
 *
 * Measured 2026-11-11 on suite 19 run `s19r18` (BOARD F-148). The plan's leaves said *"Journal contains the
 * verbatim combined output of the declared check command and its numeric exit code"*, and the coding worker's
 * only durable output is its report — so it read the word as a place and created one: `LL-1.2/`, `LL-1.4/`,
 * `LL-2.1/`, `LL-2.2/journal.md`, four new top-level directories in a legacy checkout whose own criteria say
 * `git status --porcelain` is empty. `LL-1.2/journal.md` opens by stating it changed nothing in the tree.
 *
 * The word is the product's, and it is not wrong about the product: the journal is the platform's record and a
 * job's summary is persisted there as the `completion_report` entry. What is missing in a criterion is the
 * statement of *where the content goes*, and a plan that names a place the agent cannot write makes the agent
 * invent one. So both planning prompts state the split: a recording criterion says what was observed and that
 * it is recorded in the completion report, and never names a file, a directory or "the journal" as a place the
 * agent writes.
 */
describe("the planning prompts separate the work from the record of it (suite 19 / F-148)", () => {
  const prompts: Array<[string, string]> = [
    ["the project planner", buildDecomposeSystemPrompt("fine")],
    ["the single-task planner", PLANNER_SYSTEM_PROMPT],
  ];

  for (const [name, prompt] of prompts) {
    it(`${name} says a recording criterion names the completion report, not a file`, () => {
      expect(prompt).toMatch(/separate the work from the record/i);
      expect(prompt).toMatch(/completion report/i);
      expect(prompt).toMatch(/never name a file(?: path)?, a directory, or "the journal"/i);
    });

    it(`${name} keeps the vocabulary the platform actually uses`, () => {
      // The criterion's word is not banned — it is defined. A planner told only "never say journal" would lose
      // the concept; a planner told what the word means writes a criterion a worker can satisfy.
      expect(prompt).toMatch(/persists? as the work-item journal entry/i);
      expect(prompt).toMatch(/s19r18/);
    });
  }
});

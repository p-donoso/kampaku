import { describe, expect, it } from "vitest";
import { deriveFrozenPaths, extractForbiddenFilePaths, extractImpliedFilePaths } from "../../src/delegator/plan-validation.js";

/**
 * **A prohibition that quantifies something else does not freeze the path beside it.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`, scenario M. The plan's leaf description reads, verbatim:
 *
 * > In the new file `packages/orders/test/summary.test.js`, use plain `node:assert/strict` with **no framework** and
 * > **no new dependency**, per CONTRIBUTING.md
 *
 * and its acceptance criterion is *"`packages/orders/test/summary.test.js` exists and asserts …"*. One path, two
 * prohibitions, and neither prohibition is about that path: they quantify a *framework* and a *dependency*.
 *
 * `deriveFrozenPaths` answered `["packages/orders/test/summary.test.js"]`, the write boundary refused it, and the job
 * was failed `WORKER_NO_DELIVERABLES: The task finished without writing or updating any files in the repository` —
 * three times, checkout untouched. The platform froze the file it had ordered, then faulted the leaf for not writing
 * it. The suite's own oracle asks the opposite: *any created file is justified by the request*.
 */
const M_LEAF = [
  "Implement summarizeOrder and its tests",
  "Add the new file `packages/orders/src/summary.js`, exporting a pure function summarizeOrder(order) that validates " +
    "the single record through assertOrder imported from @mono/contract and returns exactly { id, status, amountCents }. " +
    "In the new file `packages/orders/test/summary.test.js`, use plain node:assert/strict with no framework and no new " +
    "dependency, per CONTRIBUTING.md; cover a valid order, an invalid order refused, and the input unchanged.",
].join("\n\n");

describe("a deliverable is not frozen by the prohibitions around it (suite 19 / s19r22)", () => {
  it("leaves the leaf's own two new files writable", () => {
    const frozen = deriveFrozenPaths({ title: "Implement summarizeOrder and its tests", description: M_LEAF });
    expect(frozen).toEqual([]);
    expect(extractForbiddenFilePaths(M_LEAF)).toEqual([]);
    const writable = extractImpliedFilePaths(M_LEAF);
    expect(writable).toContain("packages/orders/src/summary.js");
    expect(writable).toContain("packages/orders/test/summary.test.js");
  });

  it("still freezes a path a clause actually protects", () => {
    // The two measured shapes F-100 records, plus the one this leaf's sibling plan stated.
    expect(
      extractForbiddenFilePaths("No change to `words.py` semantics, and `src/ledger/totals.py` must stay green unmodified."),
    ).toEqual(["words.py", "src/ledger/totals.py"]);
    expect(
      deriveFrozenPaths({
        title: "Repair the parser",
        description: "Fix `src/ledger/parse.py`. Do not modify `packages/contract/src/index.js` in this task.",
      }),
    ).toEqual(["packages/contract/src/index.js"]);
  });

  it("does not let a stored freeze outrank the item's own deliverable", () => {
    // The persisted list is what an item planned before the reading was fixed carries; the item's own criteria are
    // the last word, or every dispatch freezes the artifact again (`s19r22`, seven dispatches, nothing landed).
    const frozen = deriveFrozenPaths({
      title: "Repair the parser",
      description: "Add the new file `packages/orders/src/summary.js` and the new file `packages/orders/test/summary.test.js`.",
      declared: ["packages/orders/src/summary.js", "packages/contract/src/index.js"],
    });
    expect(frozen).toEqual(["packages/contract/src/index.js"]);
  });

  it("keeps a declared freeze that no deliverable contradicts", () => {
    expect(
      deriveFrozenPaths({
        title: "Repair the parser",
        description: "Fix `src/ledger/parse.py`.",
        declared: ["packages/contract", "apps/core"],
      }),
    ).toEqual(["packages/contract", "apps/core"]);
  });
});

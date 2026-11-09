import { describe, expect, it } from "vitest";
import { deriveParentWorkItemStatus } from "../../src/application/pm/work-item-status-rollup.js";

/**
 * **A tree of `done` plus a dismissed conditional leaf is finished.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r17`. The plan's fifth leaf was written to act only if L1's run had been
 * refused for a missing executable bit, and its own criterion said so: *"If the trigger condition was not met, the
 * leaf is dismissed in the journal with the reason 'not needed: the runner executed on the first attempt'"*. The
 * runner executed, so the leaf was dismissed — and the phase that owns it read `in_progress` forever, because the
 * two arms that could have covered it asked `every child done` and `every child cancelled`, and its children were
 * both.
 *
 * Settled is settled: a child that will not be done because it was never needed is not outstanding work.
 */
describe("a parent with a dismissed child (suite 19 / s19r17)", () => {
  it("is done when the rest of its children are done", () => {
    expect(deriveParentWorkItemStatus(["done", "done", "done", "done", "cancelled"])).toBe("done");
  });

  it("is still cancelled when nothing under it ran", () => {
    expect(deriveParentWorkItemStatus(["cancelled", "cancelled"])).toBe("cancelled");
  });

  it("is still in progress while a child is unfinished", () => {
    // Unchanged by this rule: settled work beside outstanding work is work under way, which is what `in_progress`
    // has always meant here.
    expect(deriveParentWorkItemStatus(["done", "cancelled", "todo"])).toBe("in_progress");
  });

  it("is still blocked while a child is blocked", () => {
    expect(deriveParentWorkItemStatus(["done", "cancelled", "blocked"])).toBe("blocked");
  });
});

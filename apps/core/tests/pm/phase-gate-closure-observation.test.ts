import { describe, expect, it } from "vitest";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";
import { shouldBlockDishonestSuccess } from "../../src/application/pm/done-honesty.js";
import { phaseGateOwesNoFiles } from "../../src/application/pm/phase-auditor-gate.js";
import { dispatchRequiredChecks } from "../../src/application/pm/leaf-checks.js";
import { closureRequiredChecksFor } from "../../src/application/pm/execute-work-item.js";

/**
 * **A phase gate on somebody else's checkout is an observation at closure too, not only at dispatch.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`. The Phase 1 audit gate on
 * `/home/pdonoso/kampaku-projects/s19r19/legacy-ledger` ran read-only, wrote no file (its own description told it
 * not to), and its completion report carried the rubric — *"Verdict: NOT READY … findings each anchored to a file
 * path"* — with the verbatim red runner it sampled. Closure refused it:
 *
 *     checks (checks_not_run): Required checks not run: test.
 *
 * Two readers of one job disagreed. The **dispatch** knows the structural fact (`phaseGateOwesNoFiles`): a gate on a
 * checkout that is not the platform's owes no file and gets no check to turn green. The **closure** re-derived a
 * check from the leaf's prose — its criterion says `./run-tests.sh exits 0`, and its title quotes the phase it
 * audits — so it demanded a green runner the leaf may not write to.
 *
 * The job could not have satisfied it by any means: the runner it samples stays red until the phase behind it repairs
 * the defects. The gate was a closed loop, and the whole line waited on it.
 */
const CHECKOUT = "/home/pdonoso/kampaku-projects/s19r19/legacy-ledger";

const gateItem = {
  id: "dacd70d8-1db1-411e-97fb-73fa1d27f429",
  projectId: "p",
  title: "Audit phase — Phase 1 — Reproduce the two documented failures (no writes)",
  description:
    'Hard phase gate for "Phase 1 — Reproduce the two documented failures (no writes)". Record the audit in your ' +
    "completion report, using the deliverable-readiness rubric. Do not add files to this checkout.",
  status: "in_progress",
  routingReason: "phase_gate:92b71a0e-1e49-4e69-9561-ab34af801956",
  acceptanceCriteria: ["./run-tests.sh exits 0"],
  dependsOn: [],
  frozenPaths: [],
} as unknown as WorkItemRecord;

const report = { kind: "completion_report", metadata: {} };

const succeeded = {
  id: "8152e0e6-683a-40e3-9240-b869d9b9090d",
  status: "succeeded",
  output: {
    summary:
      "## Audit (deliverable-readiness rubric)\n\n**Verdict: NOT READY** — readiness score 4/10, recorded at " +
      "phase 1 with the repository unchanged.\n\nFindings, each anchored to a file path:\n\n" +
      "1. `src/ledger/parse.py` — `parse_lines` splits every non-blank line on `:`, so a `#` comment line raises " +
      "`ValueError: not enough values to unpack (expected 2, got 1)`. Verbatim traceback from `checks/test_parse.py` " +
      "is quoted above; the runner reports `checks/test_parse.py ... FAILED`.\n" +
      "2. `src/ledger/totals.py` — `total([])` returns `None` instead of `0`; `checks/test_totals.py` fails on " +
      "`assert total([]) == 0`, and the runner reports `checks/test_totals.py ... FAILED`.\n\n" +
      "Both failures are the ones the phase exists to reproduce, they are deterministic across two consecutive runs, " +
      "and `checks/` contains exactly these two scripts, so the runner's coverage is fully accounted for. The house " +
      "rules in `CONTRIBUTING.md` (`./run-tests.sh` as the only supported check, stdlib only, no packaging file, no " +
      "f-string, 4 spaces, 100 columns, three public names) constrain the repairs that follow.",
    checkResults: {},
  },
} as never;

describe("a phase gate's closure reading (suite 19 / s19r22)", () => {
  it("refuses the gate when the closure treats it as a repair leaf — the measured refusal", () => {
    const block = shouldBlockDishonestSuccess(gateItem, succeeded, [report], undefined, {
      requiredChecks: ["test"],
      evidenceOnly: false,
    });
    expect(block.block).toBe(true);
    expect(block.block && block.code).toBe("checks_not_run");
  });

  it("derives no check for it, which is what the dispatch derived and what the closure must re-derive", () => {
    const leafInput = {
      title: gateItem.title,
      description: gateItem.description ?? undefined,
      acceptanceCriteria: gateItem.acceptanceCriteria as string[],
    };
    // The prose reading alone demands the aggregate — the refusal measured on the run.
    expect(dispatchRequiredChecks(leafInput, CHECKOUT)).toEqual(["test"]);
    // The structural reading, which is the one the dispatch used.
    expect(dispatchRequiredChecks({ ...leafInput, readOnly: phaseGateOwesNoFiles(gateItem, "legacy-ledger") }, CHECKOUT))
      .toEqual([]);
    // And the closure's own derivation answers the same, because it is the same function.
    expect(closureRequiredChecksFor(gateItem, CHECKOUT, "legacy-ledger")).toEqual([]);
  });

  it("closes it when the report carries the rubric the gate demanded", () => {
    const block = shouldBlockDishonestSuccess(gateItem, succeeded, [report], undefined, {
      requiredChecks: closureRequiredChecksFor(gateItem, CHECKOUT, "legacy-ledger"),
      evidenceOnly: phaseGateOwesNoFiles(gateItem, "legacy-ledger"),
    });
    expect(block.block, JSON.stringify(block)).toBe(false);
  });

  it("keeps the platform's own gate owing its file, which is the control in the other direction", () => {
    expect(phaseGateOwesNoFiles(gateItem, "kampaku")).toBe(false);
    expect(closureRequiredChecksFor(gateItem, CHECKOUT, "kampaku")).toEqual(["test"]);
  });
});

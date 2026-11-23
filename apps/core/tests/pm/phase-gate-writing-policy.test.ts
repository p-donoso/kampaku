import { describe, expect, it } from "vitest";
import { resolveJobWritingPolicy } from "../../src/planner/create-goal.js";
import { phaseGateOwesNoFiles } from "../../src/application/pm/phase-auditor-gate.js";

/**
 * **A phase gate on somebody else's repository owes no file, and must not be failed for writing none.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r20`. The gate leaf's description — written by
 * `auditLeafDescription` — says *"Record the audit in your completion report … Do not add files to this checkout — it
 * is not the platform's, and a document nobody asked for is a change to it."* The job obeyed it and was failed
 * `WORKER_NO_DELIVERABLES: The task finished without writing or updating any files in the repository.`
 *
 * Two readers of one item disagreed. The **item** says the verdict goes in the report (`auditAcceptanceCriteria`
 * stops naming a path for every project that is not the platform's, and `shouldBlockDishonestSuccess` reads the
 * report afterwards). The **dispatch** asked the prose classifier, which could not answer: the leaf's title quotes
 * the phase it audits — *"Audit phase — Phase 2 — Repair the two failing declared checks in place"* — so a change
 * verb sits in the title and the reading answers "this leaf writes".
 *
 * So the structure answers instead: a phase gate is a gate (`routingReason`), and only the platform's own project
 * keeps its audit on disk (`auditArtifactLivesInCheckout`). On that project the leaf still writes
 * `docs/audit/latest.md` and is still judged on it.
 */
describe("a phase-gate leaf's writing policy (suite 19 / s19r20)", () => {
  const gateReason = "phase_gate:4eb420d3-2023-4e55-8d0a-58e5b2e0a49e";

  it("reads the gate from the routing reason, not from the title's vocabulary", () => {
    expect(phaseGateOwesNoFiles({ routingReason: gateReason }, "legacy-ledger")).toBe(true);
    expect(phaseGateOwesNoFiles({ routingReason: gateReason }, "kampaku"), "the platform's own audit is a file").toBe(
      false,
    );
    expect(phaseGateOwesNoFiles({ routingReason: undefined }, "legacy-ledger")).toBe(false);
  });

  it("dispatches it read-only with no deliverable owed, so it is not failed for obeying its own text", () => {
    // The objective `auditLeafDescription` actually produced on this run, verbatim.
    const objective =
      'Audit phase — Phase 2 — Repair the two failing declared checks in place. Hard phase gate for "Phase 2 — ' +
      'Repair the two failing declared checks in place". Do not mark this phase done until a sensei-grade audit ' +
      "artifact exists. Record the audit in your completion report, using the deliverable-readiness rubric: a " +
      "verdict, a numeric score, and findings each anchored to a file path. Do not add files to this checkout — it " +
      "is not the platform's, and a document nobody asked for is a change to it. Do not emit a stub JSON such as " +
      '{"status":"ready"}. Sampled leaf AC re-run: "Skip comment lines in ledger.parse.parse_lines" — run ' +
      "./run-tests.sh and record stdout. If the gate fails, reopen affected tasks; do not advance to the next track.";
    // The prose reading alone says this leaf writes — `repair` is in the phase's title, quoted in the leaf's — which
    // is the whole defect: the job was failed for obeying the sentence three clauses later.
    expect(resolveJobWritingPolicy({ objective })).toEqual({ readOnly: false, requiresDeliverables: true });
    // The structural answer wins.
    expect(resolveJobWritingPolicy({ objective, observationOnly: true })).toEqual({
      readOnly: true,
      requiresDeliverables: false,
    });
  });

  it("leaves an ordinary repair leaf exactly as it was", () => {
    expect(resolveJobWritingPolicy({ objective: "Skip comment lines in ledger.parse.parse_lines" })).toEqual({
      readOnly: false,
      requiresDeliverables: true,
    });
    expect(
      resolveJobWritingPolicy({ objective: "Verification only — make NO source edits; run ./run-tests.sh." }),
    ).toEqual({ readOnly: true, requiresDeliverables: false });
  });
});

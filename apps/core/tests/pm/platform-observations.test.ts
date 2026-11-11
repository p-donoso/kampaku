import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isPresenceOnlyCriterion,
  pathsNamedIn,
  platformArtifactObservations,
} from "../../src/application/pm/platform-observations.js";
import { identifyAcceptanceCriteria } from "../../src/application/pm/acceptance-criteria.js";
import { evaluateCriterionEvidenceGate } from "../../src/application/pm/done-honesty.js";
import type { WorkItemRecord } from "../../src/persistence/pm-store.js";

/**
 * **A criterion about a path the platform is already holding is answered by reading it.**
 *
 * Measured 2026-11-09 on suite 19 run `s19r17`, scenario M (BOARD F-145). The contract-safety slice carries two
 * criteria: `` `npm run test` exits 0 `` and `file exists at packages/contract/package.json`. The router sent the
 * second to `inspect_artifact` — correctly — and the job, which is read-only and runs the repository's own
 * checks, recorded the check and no artifact inspection, because a file that must merely still be there is not
 * something a job has any reason to look at. Closure then refused the leaf `criteria_without_evidence: ac-2`
 * with the file sitting in the checkout, and the operator cleared it by looking at the path and recording the
 * acceptance. The platform demanded a witness for a fact it held.
 *
 * What this lock must not allow: a criterion about **content** decided by presence, a path **outside** the
 * checkout, or a record produced when the file is absent — that last one is what the criterion is for.
 */
describe("the evidence Core reads for itself (suite 19 / s19r17)", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function checkout(files: string[]): string {
    const root = mkdtempSync(join(tmpdir(), "kampaku-platform-read-"));
    dirs.push(root);
    for (const file of files) {
      const path = join(root, file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "{}\n");
    }
    return root;
  }

  function checkRecord(criterionId: string) {
    return {
      criterionId,
      subjectType: "behavior",
      verificationMethod: "command",
      subject: "npm run test passes",
      passed: true,
      verified: true,
      sourceTool: "run_check",
      observedAt: new Date().toISOString(),
      reference: "npm run test",
    };
  }

  function workItem(criteria: string[]): WorkItemRecord {
    const now = new Date().toISOString();
    return {
      id: "slice-2",
      projectId: "project-1",
      title: "Prove the @mono/contract surface is unchanged",
      status: "in_progress",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: criteria,
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  it("reads the specimen criterion off the checkout and closes the leaf", () => {
    const root = checkout(["packages/contract/package.json"]);
    const criteria = [
      "npm run test exits 0 (declared by package.json scripts.test).",
      "file exists at packages/contract/package.json",
    ];
    const identified = identifyAcceptanceCriteria(criteria);

    const records = platformArtifactObservations(identified, root);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      criterionId: "ac-2",
      subjectType: "artifact",
      verificationMethod: "file-inspection",
      subject: "artifact:packages/contract/package.json",
      passed: true,
    });

    // The gate now answers for ac-2 itself, where it used to refuse for it.
    const gate = evaluateCriterionEvidenceGate(
      workItem(criteria),
      {
        evidence: [
          {
            criterionId: "ac-1",
            subjectType: "behavior",
            verificationMethod: "command",
            subject: "npm run test passes",
            passed: true,
            verified: true,
            sourceTool: "run_check",
            observedAt: new Date().toISOString(),
            reference: "npm run test",
          },
        ],
      },
      { checkoutPath: root },
    );
    expect(gate).toEqual({ block: false });
  });

  it("still refuses when the path is not there", () => {
    const root = checkout([]);
    const criteria = ["npm run test exits 0.", "file exists at packages/contract/package.json"];
    expect(platformArtifactObservations(identifyAcceptanceCriteria(criteria), root)).toEqual([]);
    const gate = evaluateCriterionEvidenceGate(
      workItem(criteria),
      { evidence: [checkRecord("ac-1")] },
      { checkoutPath: root },
    );
    expect(gate).toMatchObject({ block: true, code: "criteria_without_evidence" });
    expect((gate as { missing: string[] }).missing).toEqual(["ac-2"]);
  });

  it("does not decide a criterion about the file's contents", () => {
    const root = checkout(["packages/contract/package.json"]);
    for (const text of [
      "packages/contract/package.json declares version 1.2.0",
      "packages/contract/src/index.js contains ORDER_STATUSES unchanged at [pending, paid, refunded]",
      "The file exists at packages/contract/package.json and states the contract version",
    ]) {
      expect(isPresenceOnlyCriterion(text), text).toBe(false);
      expect(platformArtifactObservations(identifyAcceptanceCriteria([text]), root), text).toEqual([]);
    }
  });

  it("never reads outside the checkout it was given", () => {
    // A real file, one directory up: the guard is what must refuse it, not the path extractor.
    const parent = mkdtempSync(join(tmpdir(), "kampaku-platform-parent-"));
    dirs.push(parent);
    const root = join(parent, "checkout");
    mkdirSync(join(root, "packages"), { recursive: true });
    writeFileSync(join(parent, "outside.json"), "{}\n");
    writeFileSync(join(parent, "secrets.config.json"), "{}\n");
    for (const text of [
      "file exists at ../outside.json",
      "file exists at ../../secrets.config.json",
      "file exists at /etc/hostname",
    ]) {
      expect(platformArtifactObservations(identifyAcceptanceCriteria([text]), root), text).toEqual([]);
    }
  });

  it("produces nothing when no checkout is in hand", () => {
    const criteria = ["file exists at packages/contract/package.json"];
    expect(platformArtifactObservations(identifyAcceptanceCriteria(criteria), undefined)).toEqual([]);
    const withTheCheck = workItem(["npm run test exits 0.", ...criteria]);
    expect(
      evaluateCriterionEvidenceGate(withTheCheck, { evidence: [checkRecord("ac-1")] }, {}),
      "absence of knowledge is not proof",
    ).toMatchObject({ block: true, code: "criteria_without_evidence" });
  });

  it("finds the path a plan actually writes", () => {
    expect(pathsNamedIn("file exists at packages/contract/package.json")).toEqual([
      "packages/contract/package.json",
    ]);
    expect(pathsNamedIn("`test -f docs/audit/latest.md` exits 0")).toEqual(["docs/audit/latest.md"]);
    expect(pathsNamedIn("the report is complete")).toEqual([]);
  });
});

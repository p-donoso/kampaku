/**
 * @module application/pm/leaf-checks
 *
 * **A leaf is asked to prove what it owns, and the plan's gate proves the whole.**
 *
 * Why this module exists, and it is the second half of the same measurement. A repository whose only check is one
 * runner usually has several checks *inside* it: suite 19's legacy checkout's `run-tests.sh` loops
 * `checks/test_*.py` with `PYTHONPATH=src python3` and does nothing else, so that repository declares one check per
 * script. The platform collapsed them all into the single name `test`.
 *
 * Measured live on run `s19r7`, on a plan with two independent one-line repairs and a verification leaf:
 *
 * - the first repair leaf's criterion named its own proof, `PYTHONPATH=src python3 checks/test_parse.py`, which is
 *   the file the runner enumerates;
 * - the job's required check resolved to the whole `./run-tests.sh`, which still fails on the *other* defect;
 * - the job wrote the correct fix and **failed** `WORKER_CHECKS_INCOMPLETE` for a defect it had nothing to do with;
 * - the item went `blocked` and was re-dispatched, and the re-dispatch failed `WORKER_NO_DELIVERABLES` because the
 *   fix was already on disk. Two failures on one leaf, for a repair that was right.
 *
 * So the rule this module encodes: **when a leaf's criteria name a check that is a member of the repository's
 * runner, that member is the leaf's proof, and the aggregate is not required of it.** The aggregate is the plan's
 * gate, and the plan's verification leaf names it alone — which is also what ordering the verification leaf last
 * means. A leaf that names no member keeps exactly today's behaviour.
 *
 * Evidence only: a member only exists when the runner enumerates an executable file (`declared-checks.ts` reads
 * that), and nothing here invents a name.
 */

import { resolveDeclaredCheckCommands } from "./declared-checks.js";
import { isEvidenceOnlyObjective } from "./deliverable-requirements.js";
import { inferRequiredCheckScripts } from "./work-item-checks.js";

/** The objective-shaped inputs a leaf's check requirement is read from. */
export interface LeafCheckInput {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  /** A whole objective, when there is no work item (a direct `kampaku run`). */
  text?: string;
}

/** A success assertion, the same reading `work-item-checks.ts` applies to a criterion. */
const SUCCESS_ASSERTION =
  /(?:^|[\s`"'(])(?:exits?\s+(?:with\s+)?(?:code\s+)?0|exit\s+code\s+0|passes|passing|is\s+green|goes\s+green|succeeds|succeeded|returns?\s+0|ok:\s*true|is\s+clean)(?=$|[\s`"'.,;:)])/i;

function textOf(input: LeafCheckInput): string {
  if (input.text) return input.text;
  return [input.title, input.description, ...(input.acceptanceCriteria ?? [])].filter(Boolean).join("\n\n");
}

/** The criteria of a leaf that require a check to come out green. */
function successTexts(input: LeafCheckInput): string[] {
  if (input.text) return [input.text];
  const criteria = input.acceptanceCriteria ?? [];
  if (criteria.length === 0) return [textOf(input)];
  return criteria.filter((criterion) => SUCCESS_ASSERTION.test(criterion));
}

/**
 * A check the repository declares **as a file its runner enumerates**, quoted by this leaf's criteria.
 *
 * The name is the relative path, which is what the runner writes and what the worker's `run_check` resolves; the
 * reading is a quoted-span match against a declaration that exists on disk.
 */
function quotedMemberChecks(input: LeafCheckInput, checkoutPath: string | undefined): string[] {
  if (!checkoutPath) return [];
  // Only the criteria that assert a **good** result, never one that asks for the check's output. The difference is
  // the whole reason a baseline leaf can exist: `Per-check status is recorded separately (ok or FAILED)` is an
  // observation, and requiring it green is the closed loop measured on suite 19 `s19r3`. A criterion that mentions
  // a member without asserting success does not make the member a gate.
  const text = successTexts(input).join("\n");
  const declared = resolveDeclaredCheckCommands(checkoutPath);
  const members = declared.filter((command) => command.evidence.includes("enumerated by"));
  return members
    .filter((member) => text.includes(member.name) || text.includes(member.command))
    .map((member) => member.name);
}

/**
 * The checks a job dispatched for this leaf must **pass**.
 *
 * - names a member of the repository's runner → the member (the leaf's own proof);
 * - names no member → the neutral checks its success assertions require (today's behaviour).
 *
 * `checkoutPath` absent means this process cannot read the checkout, and then nothing is narrowed: a verdict about
 * a repository nobody read is the same mistake in the other direction.
 */
export function requiredPassingChecksFor(input: LeafCheckInput, checkoutPath?: string): string[] {
  if (isEvidenceOnlyObjective(textOf(input))) return [];
  const members = quotedMemberChecks(input, checkoutPath);
  if (members.length > 0) return [...new Set(members)];
  return [...new Set(successTexts(input).flatMap((text) => inferRequiredCheckScripts(text)))];
}

/**
 * The checks a **dispatched job** must pass, which is where a read-only leaf is finally decided.
 *
 * The same rule as {@link requiredPassingChecksFor}, applied at the one point every job passes through. A leaf that
 * may not write cannot make a failing check pass by construction: its job is to run the check and record what it
 * printed. Measured 2026-11-09 on run `s19r13`, where the read-only inventory leaf's job carried
 * `requiredChecks: ["test"]` — inherited from the objective above it, which talks about the whole checkout going
 * green — ran the check, recorded the failure verbatim, wrote nothing (exactly as told), and failed
 * `WORKER_CHECKS_INCOMPLETE`. Twice. The container above it waited on a leaf that could never pass.
 *
 * `readOnly` and the deliverables exemption are the same reading (`isEvidenceOnlyObjective`), so the exemption and
 * this constraint cannot disagree.
 */
export function dispatchRequiredChecks(
  input: LeafCheckInput & { readOnly?: boolean },
  checkoutPath?: string,
): string[] {
  if (input.readOnly === true) return [];
  return requiredPassingChecksFor(input, checkoutPath);
}

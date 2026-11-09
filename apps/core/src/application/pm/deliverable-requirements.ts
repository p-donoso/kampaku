/**
 * @module application/pm/deliverable-requirements
 *
 * **A job that is asked to observe is not asked to write**, read once and used for two decisions.
 *
 * Why this module exists, and why it now answers two questions instead of one. Measured 2026-11-08 on suite 19's
 * runs `s19r5` and `s19r6` (BOARD F-093), on an evidence-only leaf whose own description said *"Independent
 * verification only — make NO source edits"*: the job ran the repository's declared checks, recorded
 * `checkResults.test: true`, wrote no source — and was failed with `WORKER_NO_DELIVERABLES`, because the
 * mutation count was zero. The classifier below was taught the wording, and the retry then **succeeded by
 * writing an unrequested audit file** (`packages/orders/test/by-status.audit.md`), which is the same defect with
 * its sign flipped: the job was let through by an exemption from the deliverables rule, while nothing stopped it
 * from writing into a checkout the emperor had asked to be left alone.
 *
 * So the reading is one reading and it has two consumers:
 *
 * - {@link inferRequiresDeliverables} — the deliverables gate (a job that must not write must not be failed for
 *   not writing);
 * - {@link inferReadOnlyJob} — the **write boundary** (a job that must not write is refused when it tries).
 *
 * A rule with only the first half is an exemption, and an exemption is not a constraint.
 */

/**
 * Objectives that state the work is observation, verification or analysis rather than a change.
 *
 * The vocabulary is deliberately the words a plan actually writes for such a leaf, each one measured on a run:
 * `Review only`, `read-only`, `Investigate only`, `analysis only`, `verification only`, `evidence only`,
 * `no file changes`, `no code changes`, `no source edits`, `writing no files`, and `make NO … edits` in the
 * second-person form `s19r6` used. It is not a taxonomy: prose this list does not recognise leaves the job
 * write-enabled, which is the safe direction for a constraint and the cheap one for a rule.
 *
 * Every `X only` arm accepts the hyphen as well as the space, and the write arms accept `writes` beside `write`.
 * Measured 2026-11-09 on suite 19 run `s19r16`: a slice whose own text opened `VERIFICATION-ONLY slice` and then
 * `writes no file at all` matched **neither** frame, so it was read as a writing leaf — and because a writing leaf is
 * refused for landing no file, the plan's own lead amended it to write `docs/evidence/…` into the checkout it exists
 * to prove untouched. One missed hyphen put a new top-level entry in a legacy tree.
 */
const EVIDENCE_ONLY_PATTERN =
  /\b(?:review[- ]only|read[- ]only|investigate[- ]only|analysis[- ]only|verification[- ]only|evidence[- ]only|audit[- ]only|inspection[- ]only|no file changes|no code changes|no (?:source )?edits?|writ(?:e|es|ing|ten) no (?:files?|changes?)|make no (?:source )?(?:edits?|changes?)|writes no file)\b/i;

/**
 * Whether this objective asks for a change at all.
 *
 * `true` when the work is stated as observation; `false` when the text asks for work to be done. Named for the
 * reader rather than for the pattern, because both call sites ask a question in plain words.
 */
export function isEvidenceOnlyObjective(objective: string): boolean {
  return EVIDENCE_ONLY_PATTERN.test(objective);
}

/** Whether the job must produce files. The deliverables gate's question. */
export function inferRequiresDeliverables(objective: string): boolean {
  return !isEvidenceOnlyObjective(objective);
}

/**
 * Whether the job must not write at all. The write boundary's question.
 *
 * The same reading, so the exemption and the constraint cannot disagree: a job exempted from the deliverables
 * rule is exactly the job that is refused at the write boundary, and a job that may write is failed when it
 * writes nothing.
 */
export function inferReadOnlyJob(objective: string): boolean {
  return isEvidenceOnlyObjective(objective);
}

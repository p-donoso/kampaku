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
 * A sentence that **bans this leaf from writing at anything** — the strongest statement of observation there is.
 *
 * Read separately from {@link EVIDENCE_ONLY_PATTERN} because it is a different grammar: a prohibition with a
 * *generic* object. `This leaf must not edit, create or delete anything` and `write nothing to the checkout` say the
 * leaf does not write, whatever else the paragraph goes on to name. A prohibition on a *particular* thing — `do not
 * change the signature`, `do not edit the layout` — is a constraint on a leaf that still writes, and it must not be
 * read this way.
 *
 * Measured 2026-11-23 on suite 19 run `s19r22`. The independent verification leaf's description says, verbatim,
 * *"This leaf must not edit, create or delete anything"*, and the job that ran it was dispatched
 * `requiresDeliverables: true`, obeyed the sentence, and was failed
 * `WORKER_NO_DELIVERABLES: The task finished without writing or updating any files in the repository` — then its
 * blocker froze the leaf and the run stalled one step from the end. The reading had two holes on that paragraph:
 * the negation only reached the first verb of a coordinated list (`must not edit, create or delete`), and the phrase
 * *"(expect exactly two **modified** entries and no untracked paths)"* — a noun describing what `git status` prints —
 * counted as a request to modify.
 */
const WRITING_BAN_PATTERN =
  /\b(?:(?:do not|don't|does not|must not|never|no)\s+(?:(?:edit|create|delete|write|modify|change|touch)\b[\s,]*(?:or\s+|and\s+)?){1,4}(?:anything|any\s+(?:file|files|source|code|path|paths|content)|the\s+(?:checkout|repository|repo|working\s+tree)|a\s+file\b)|(?:edit|create|delete|write|modify|change|touch|add|remove)\s+no\s+(?:files?|paths?|changes?|edits?|director(?:y|ies))\b|writ(?:e|es|ing|ten)\s+nothing\b|nothing\s+(?:is|was|gets)\s+(?:written|changed|edited)|no\s+(?:\w+\s+){0,4}(?:file|files|source|code|path|paths)\s+(?:\w+\s+){0,4}(?:may|must|should|is|are|will|can)\s+be\s+(?:changed|edited|written|modified|created|deleted|touched))/i;

/** Whether the text bans this leaf from writing at all. */
export function bansWriting(text: string): boolean {
  return WRITING_BAN_PATTERN.test(text);
}

/**
 * **A leaf required to leave an empty tree cannot owe a file.**
 *
 * Measured 2026-11-23 on suite 19's run `s19r25`, on `A2 — Execute declared checks and capture baseline failures`.
 * Its `ac-4` reads *"`git status --porcelain` reported at the end of this leaf is empty"*, and its description adds
 * *"do not create any evidence file in the checkout"*, *"do not add files, directories, or docs/"* and *"Phase A must
 * leave the checkout byte-identical"*. The dispatch carried `requiresDeliverables: true` anyway: the agent obeyed,
 * reported the failing output, wrote nothing, and the job was failed `WORKER_NO_DELIVERABLES`. The plan's own lead
 * had even written the workaround into the leaf — *"a job that ends with zero repository mutations may be rejected …
 * that rejection is expected"* — which is the product asking for two mutually exclusive things.
 *
 * So the requirement is read for what it is. It is not a verb list, because no verb list enumerates every way a plan
 * says *do not write*: it is the **tree state the leaf's own evidence demands**. A leaf that must leave
 * `git status` empty may not write, and there is nothing to weigh against it.
 *
 * Deliberately narrow, because the general reading must not come back (BOARD F-157): a criterion that merely
 * *quotes* `git status --porcelain`, or names `make check`, still says nothing about the leaf's obligation. Only an
 * explicit clean-tree requirement fires.
 */
const CLEAN_TREE_PATTERNS = [
  /\bgit status(?:\s+--porcelain)?\b[^.\n]{0,80}\b(?:is|be|are|remains?|stays?|must be|should be|produced|printed|shows?|showed|returns?)\b[^.\n]{0,20}\b(?:empty|clean|no output|nothing)\b/i,
  /\b(?:empty|no output|nothing)\b[^.\n]{0,40}\bgit status\b/i,
  /\b(?:checkout|repository|working tree|tree|worktree)\b[^.\n]{0,60}\b(?:is|are|remains?|stays?|left|must be|must stay)\b[^.\n]{0,30}\b(?:byte-identical|untouched|unmodified|unchanged|pristine|clean)\b/i,
  /\bno\s+(?:files?|paths?|entries|director(?:y|ies))\b[^.\n]{0,40}\b(?:created|modified|added|deleted|written|renamed)\b/i,
];

/**
 * A clean-tree claim **scoped to the files the leaf is not repairing**.
 *
 * *"Every other file in the checkout was left untouched by this leaf"* is what a single-file repair says, and it is
 * the opposite of a writing ban: it presumes the one file changed. Read as a clean-tree requirement it made the leaf
 * read-only, so the repair it was dispatched for could not happen at all — measured 2026-11-23 on suite 19 run
 * `s19r32`, leaf `b5efd0ab`, whose job reported *"this job is read-only (\"do not write, replace or create any file
 * in the checkout\"), and the only file permitted for the fix is `src/ledger/totals.py`"* and landed nothing, with
 * `checks/test_totals.py` still failing (BOARD F-169).
 *
 * The word that decides it is **other**. "This leaf changes no file" bans writing; "no other file changed" describes
 * the blast radius of a leaf that does write.
 */
const OTHER_FILES_SCOPE =
  /\b(?:every|all|any|no|each)\s+other\s+(?:file|files|path|paths|entry|entries|change|changes|source|sources)\b/i;

/**
 * The text with every clause that scopes a clean-tree claim to *other* files removed.
 *
 * Removed clause by clause rather than the whole text being discarded: a leaf may say *"every other file untouched"*
 * **and** *"the checkout must be byte-identical"*, and the second is a writing ban whatever the first says.
 */
function withoutOtherFilesClauses(text: string): string {
  // Split on commas and semicolons as well as sentence ends, because a scoped claim is written inside a list as
  // often as it is written as its own sentence: *"every other file untouched, and the tree byte-identical"*.
  return text
    .split(/(?<=[.!?;,\n])\s/)
    .filter((clause) => !OTHER_FILES_SCOPE.test(clause))
    .join(" ");
}

/** Whether the text requires the checkout to be left exactly as it was found. */
export function requiresCleanCheckout(text: string): boolean {
  const whole = withoutOtherFilesClauses(text);
  return CLEAN_TREE_PATTERNS.some((pattern) => pattern.test(whole));
}

/**
 * Verbs that ask for a change to the checkout. Their presence means the work is not observation, whatever else the
 * sentence says — a leaf that says *"implement byStatus and prove the contract is unchanged"* writes.
 */
const CHANGE_VERB_PATTERN =
  /\b(?:implement(?:s|ed|ing)?|add(?:s|ed|ing)?|create[sd]?|creating|write[s]?|writing|wrote|writ(?:e|ten)|fix(?:es|ed|ing)?|modif(?:y|ies|ied|ying)|chang(?:e|es|ed|ing)|updat(?:e|es|ed|ing)|refactor(?:s|ed|ing)?|replac(?:e|es|ed|ing)|remov(?:e|es|ed|ing)|delet(?:e|es|ed|ing)|renam(?:e|es|ed|ing)|mov(?:e|es|ed|ing)|install(?:s|ed|ing)?|migrat(?:e|es|ed|ing)|bump(?:s|ed|ing)?|edit(?:s|ed|ing)?|patch(?:es|ed|ing)?)\b/i;

/**
 * Verbs that ask for proof of the state **as it stands**: the observation a leaf may do without writing anything.
 */
const PROOF_VERB_PATTERN =
  /\b(?:prove[sd]?|proving|verify|verifies|verified|verifying|confirm(?:s|ed|ing)?|check(?:s|ed|ing)?|assert(?:s|ed|ing)?|show(?:s|ed|ing)?|demonstrat(?:e|es|ed|ing)|evidence[sd]?|report(?:s|ed|ing)?|inspect(?:s|ed|ing)?|read(?:s|ing)?|review(?:s|ed|ing)?|audit(?:s|ed|ing)?|establish(?:es|ed|ing)?)\b/i;

/**
 * Whether this objective asks for a change at all.
 *
 * `true` when the work is stated as observation; `false` when the text asks for work to be done. Named for the
 * reader rather than for the pattern, because both call sites ask a question in plain words.
 *
 * **Two ways to be an observation, and the second one was paid for twice.** The vocabulary above catches a leaf that
 * *says* it observes — *read-only*, *verification only*, *writes no file*. A leaf that says nothing of the kind but
 * simply asks for **proof of the state as it stands** is one too: measured 2026-11-09 on suite 19 run `s19r17`,
 * where M's contract-safety leaf is titled *"Prove the @mono/contract surface is unchanged"*, its criteria are
 * `npm test --workspaces` exits 0 and `file exists at packages/contract/package.json`, and it owes no file at all —
 * yet it was failed `WORKER_NO_DELIVERABLES` twice, and L5 on the legacy side for the same reason three times. Each
 * failure cost a job and left a leaf that had done exactly what was asked unclosable.
 *
 * So: a **proof verb and no change verb** is an observation. The change verbs are what keeps this honest — a leaf
 * that says *"implement `byStatus` … and prove the contract is unchanged"* contains *implement*, so it writes, which
 * is the control the lock states. Silence stays the safe direction: a sentence with neither reading requires a file,
 * and a leaf nobody phrased well is a plan defect, not an exemption.
 */
export function isEvidenceOnlyObjective(objective: string, criteria: string[] = []): boolean {
  if (hasEvidenceOnlyWording(objective)) return true;
  // A ban on writing is not weighed against the verbs the rest of the paragraph names: a leaf told it may not write
  // cannot be required to produce a file, and a description that lists `git status` fields will always name some
  // (`deliverable-requirements.ts`, suite 19 `s19r22`).
  if (bansWriting(objective)) return true;
  // The tree the leaf's own evidence demands, from either half of what it carries. A leaf that must leave
  // `git status --porcelain` empty cannot also owe a file, and the satisfiable side is the tree — a criterion cannot
  // be met by writing something and then deleting it (`requiresCleanCheckout`, suite 19 `s19r25`).
  if (requiresCleanCheckout(objective) || criteria.some((criterion) => requiresCleanCheckout(criterion))) return true;
  return PROOF_VERB_PATTERN.test(objective) && !asksForAChange(objective);
}

/**
 * The **narrow** reading: the text says out loud that it observes and does not write.
 *
 * Kept separate because the two callers read different kinds of text. An *objective* is prose about the work, so the
 * broader reading above fits it. A **criterion** is the assertion itself — `` `make check` exits 0 `` names a proof
 * verb because a check is what it asks for, and reading that as "this leaf observes, so nothing has to pass" throws
 * away the check the leaf is required to pass. Measured 2026-11-09 minutes after the broader reading landed: suite
 * 19's `eval-brownfield-respect` and the two sibling locks went red because `requiredPassingChecksFor` answered `[]`
 * for every criterion that named a check.
 */
export function hasEvidenceOnlyWording(text: string): boolean {
  return EVIDENCE_ONLY_PATTERN.test(text);
}

/** Markers that make the verb after them a **prohibition**, which is not a request to change anything. */
const NEGATION_PATTERN =
  /(?:\bdo not|\bdon't|\bdoes not|\bmust not|\bnever|\bwithout|\bno)\s+(?:[\w'-]+\s*(?:,\s*|\bor\b\s*|\band\b\s*)?)*$/i;

/**
 * Whether the text asks for a change, reading a prohibition as a prohibition.
 *
 * A plan's own boilerplate forbids as much as it asks: the slice splitter writes *"Do not edit sibling slice files"*
 * into every slice it makes, and a leaf that only proves the state then reads as a leaf that edits files. Measured
 * 2026-11-09 on run `s19r17`: the contract-safety slice carries exactly that sentence, its two criteria are `npm run
 * test` exiting 0 and a `package.json` existing, and it was failed for landing no file.
 *
 * So a change verb counts only when nothing in the twenty characters before it negates it.
 */
function asksForAChange(text: string): boolean {
  const scan = text.slice(0, 2000);
  const pattern = new RegExp(CHANGE_VERB_PATTERN.source, "gi");
  for (const match of scan.matchAll(pattern)) {
    const before = scan.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0);
    if (NEGATION_PATTERN.test(before)) continue;
    return true;
  }
  return false;
}

/** Whether the job must produce files. The deliverables gate's question. */
export function inferRequiresDeliverables(objective: string, criteria: string[] = []): boolean {
  return !isEvidenceOnlyObjective(objective, criteria);
}

/**
 * Whether the job must not write at all. The write boundary's question.
 *
 * The same reading, so the exemption and the constraint cannot disagree: a job exempted from the deliverables
 * rule is exactly the job that is refused at the write boundary, and a job that may write is failed when it
 * writes nothing.
 */
export function inferReadOnlyJob(objective: string, criteria: string[] = []): boolean {
  return isEvidenceOnlyObjective(objective, criteria);
}

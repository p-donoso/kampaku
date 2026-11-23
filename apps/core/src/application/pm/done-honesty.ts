import type { WorkItemRecord } from "../../persistence/pm-store.js";
import { isPhaseGateWorkItem, isStubAuditText, auditArtifactIsHonest } from "./phase-auditor-gate.js";
import { evaluateJobCheckResults, inferRequiredChecksFromWorkItem } from "./work-item-checks.js";
import type { JobResultRecord } from "../../persistence/store.js";
import { evaluateQualityGate } from "./quality-gates.js";
import { platformArtifactObservations } from "./platform-observations.js";
import { completionRecordFromJournal, reportQuoteObservations } from "./report-quote.js";
import {
  evaluateEvidenceCoverage,
  keyEvidenceToCriteria,
  manualReviewEvidence,
  summarizeManualReviews,
  type CriterionEvidenceRecord,
} from "./evidence-review.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { ClosureBlock } from "./closure-refusal.js";

export class ManualDoneError extends Error {
  readonly code = "DISHONEST_DONE";

  constructor(message: string) {
    super(message);
    this.name = "ManualDoneError";
  }
}

export type ManualDoneActor = "emperor" | "auditor" | "agent";

export function resolveManualDoneActor(agentSlug?: string): ManualDoneActor {
  if (!agentSlug) return "agent";
  if (agentSlug === "kampaku") return "emperor";
  if (agentSlug.endsWith("-auditor")) return "auditor";
  return "agent";
}

export function assertManualDoneAllowed(actor: ManualDoneActor): void {
  if (actor === "emperor" || actor === "auditor") return;
  throw new ManualDoneError(
    "Manual status=done is blocked. Tasks become done from passing worker checks, or via emperor/auditor override.",
  );
}

export function hasManualDoneEvidence(entries: Array<{ kind: string }>): boolean {
  return entries.some((entry) =>
    ["completion_report", "phase_gate", "deliverable_audit"].includes(entry.kind),
  );
}

/**
 * The sensitive-material vocabulary, and which text each half of it is read from.
 *
 * **A path in the description is background, not a claim about the work.** The vocabulary used to be matched
 * against the title, the description and every criterion concatenated, so a sensitive word that appeared
 * inside a *path* in the description was read as the item's own subject. Measured 2026-10-01 on suite 08's
 * re-run `s08r9` (BOARD F-088): of the five leaves of the project, exactly one was flagged sensitive, and the
 * whole difference was one word inside one path inside one clause of its description — *"do not invent
 * `requirements/` or `docs/architecture/` directories"*, a **prohibition**. That leaf then required an
 * approved peer review before closure, it spent two succeeded jobs and two of the operator's decisions, it
 * never closed, and no surface named the rule that refused it. The four leaves that closed were not flagged.
 *
 * The rule now, and the two halves are deliberate:
 *
 * - the **title and the acceptance criteria** are read whole. A criterion naming `docs/architecture/cli.md`
 *   really is architecture work, and that lock is unchanged and asserted (see the `s08r3` case in
 *   `tests/eval/eval-hands-off-execution.test.ts`);
 * - the **description** is read with paths blanked first, because that is where a plan says what it depends
 *   on, what it must not create, and which directories are out of scope. A description that names
 *   architecture in a sentence — *"the architecture of the parser must be documented"* — still requires a
 *   review.
 */
const SENSITIVE_MATERIAL_PATTERN = /security|architect(?:ure|ural)|release|qa|quality|high[- ]impact|critical/i;
const API_SURFACE_PATTERN = /\bapi\s+(?:contract|endpoint|schema|implementation|integration)\b/i;
const RESEARCH_TITLE_PATTERN = /\b(research|documentation)\b/i;
/** A path-like token: something with a separator in it, e.g. `docs/architecture/` or `src/render/page.tsx`. */
const PATH_TOKEN = /[^\s`"'(),;]+[\\/][^\s`"'(),;]*/g;

export function requiresPeerReview(workItem: WorkItemRecord): boolean {
  const description = (workItem.description ?? "").replace(PATH_TOKEN, " ");
  const material = [workItem.title, description, ...workItem.acceptanceCriteria]
    .filter(Boolean)
    .join(" ");
  if (RESEARCH_TITLE_PATTERN.test(workItem.title)) {
    return SENSITIVE_MATERIAL_PATTERN.test(material);
  }
  return SENSITIVE_MATERIAL_PATTERN.test(material) || API_SURFACE_PATTERN.test(material);
}

export function hasApprovedPeerReview(entries: Array<{ kind: string; metadata: Record<string, unknown> }>): boolean {
  return entries.some((entry) =>
    entry.kind === "peer_review_updated" && entry.metadata.status === "approved",
  );
}

function jobOutput(result?: JobResultRecord): Record<string, unknown> {
  return result?.output && typeof result.output === "object" ? (result.output as Record<string, unknown>) : {};
}

export function jobFinishedWithoutChecks(result?: JobResultRecord): boolean {
  const output = jobOutput(result);
  return output.stalledAfterDeliverables === true || output.iterationLimitReached === true;
}

function hasVerifiedDeliverable(output: Record<string, unknown>): boolean {
  return Array.isArray(output.verificationResults)
    && output.verificationResults.some((entry) =>
      Boolean(entry) && typeof entry === "object" && (entry as { ok?: unknown }).ok === true,
    );
}

/**
 * The pre-check every job's declared evidence passes, **after Core keys it to the item's criteria**.
 *
 * The keying has to happen first, and that ordering is the whole of this function's history. A worker reports an
 * observation against the thing it observed — `check:test`, `artifact:src/x.py` — because that is what it holds;
 * the criterion link is Core's to make, and `keyEvidenceToCriteria` is where it is made (BOARD F-105). The other
 * gate, `evaluateCriterionEvidenceGate`, keys before it reads. This one validated the raw records first and
 * required `criterionId` on each of them, so a job that ran exactly the check its criterion names had its evidence
 * refused as `invalid evidence record` — measured 2026-11-04 while writing the suite-16 operator-journey lock, on
 * a leaf whose only criterion is `` `make check` exits 0 …, whose job reported `subject: "make check"`,
 * `checkResults: {test: true}` and was left **blocked** with that sentence and no way to act on it.
 *
 * A record that names no criterion **and** matches none still fails here: the refusal was right about the shape and
 * wrong about when it was applied.
 */
function evaluateStructuredEvidence(
  workItem: Pick<WorkItemRecord, "acceptanceCriteria">,
  output: Record<string, unknown>,
  evidenceOnly = false,
  container = false,
  /**
   * The subjects already red before this job ran (`baseline-checks.ts`).
   *
   * A red that was red then is the state this job was sent into, not a failure it recorded: the leaf that fixes the
   * other defect owns it. Measured 2026-11-09 on suite 19 run `s19r17`, where L2's correct two-line fix closed on its
   * own check and was refused `evidence_failed: test` for the runner still being red on L3's defect, with L3 behind it.
   */
  baselineFailedSubjects?: ReadonlySet<string>,
): { present: boolean; failed: string[] } {
  if (!Array.isArray(output.evidence)) return { present: false, failed: [] };
  const failed: string[] = [];
  const declared = output.evidence.filter(
    (entry): entry is CriterionEvidenceRecord => Boolean(entry) && typeof entry === "object",
  );
  // An entry that is not an object cannot be keyed, so it is counted here rather than silently dropped.
  const notObjects = output.evidence.length - declared.length;
  const keyed = keyEvidenceToCriteria(
    identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []),
    declared,
  );

  for (let index = 0; index < notObjects; index += 1) failed.push("invalid evidence record");

  keyed.forEach((record) => {
    const linked = Boolean(record.criterionId?.trim()) || (record.criterionIds ?? []).some((id) => id?.trim());
    if (
      !(
        typeof record.subjectType === "string" &&
        typeof record.subject === "string" &&
        typeof record.observedAt === "string" &&
        typeof record.passed === "boolean"
      ) ||
      !linked
    ) {
      failed.push("invalid evidence record");
    } else if (
      !record.passed &&
      evidenceOnly !== true &&
      !container &&
      baselineFailedSubjects?.has(record.subject) !== true
    ) {
      // A record of a check that **failed** is a failure unless this item was an observation. The distinction is
      // the whole point of a diagnosis: measured 2026-11-09 on suite 19 run `s19r16`, where the read-only Phase A
      // container's job carried its children's evidence — including `test: false`, the honest record of the runner
      // that is red because the repository is broken — and the container was then blocked `evidence_failed: test`,
      // refusing every repair leaf beneath it, two of which had already succeeded. An observation of a failure is
      // not a dishonest success, and a job that recorded a red check nobody required still cannot be closed over
      // (`eval 14/24`).
      failed.push(record.subject);
    }
  });
  return { present: true, failed };
}

export interface EvidenceGateInput {
  /** Journal store used to resolve manual evidence reviews. */
  journalStore?: JournalStore;
  /** Maximum pending manual reviews allowed before closure is blocked. Defaults to 0. */
  maxPendingManualReviews?: number;
  /**
   * The checks this item must pass, when the caller can read the checkout.
   *
   * A leaf whose criteria name a member of the repository's own runner is judged on that member, and the
   * aggregate belongs to the plan's verification leaf (`leaf-checks.ts`, suite 19 run `s19r7`). Absent means the
   * neutral reading, which is what every caller that cannot see the checkout gets.
   */
  requiredChecks?: string[];
  /**
   * Whether the item asks for observation rather than a change.
   *
   * Set with `requiredChecks`, from the same reading (`deliverable-requirements.ts`): an observation's recorded
   * failures are its findings, and a closure on them is honest.
   */
  evidenceOnly?: boolean;
  /**
   * What was already red before this job ran (`baseline-checks.ts`).
   *
   * The before-picture the closure needs to tell a regression from the state the job was sent into.
   */
  baseline?: {
    checkResults?: Record<string, unknown>;
    failedSubjects?: ReadonlySet<string>;
  };
  /** Whether this item is a container: its completion is its children's, already gated on each child. */
  container?: boolean;
  /**
   * The checkout this item works in, when the caller holds it.
   *
   * Used for the evidence Core can produce **itself**: an existence assertion about a path inside the checkout is
   * a read, not a job (BOARD F-145, `platform-observations.ts`). Absent means no platform reading, which is the
   * state every caller that cannot see a checkout is in.
   */
  checkoutPath?: string;
}

/**
 * Blocks closure when acceptance criteria are not individually proven.
 *
 * Rejected or pending manual reviews count as missing evidence, so a criterion
 * that needs a human decision cannot be closed by a passing command elsewhere.
 */
export function evaluateCriterionEvidenceGate(
  workItem: WorkItemRecord,
  output: Record<string, unknown>,
  gate: EvidenceGateInput = {},
): ({ block: true } & ClosureBlock) | { block: false } {
  // Decisions come from the journal, never from the producer. A job may not hand in a record that says
  // "human-decided" and have it counted: that is the gate certifying itself, and it is why `reflectsCriterion`
  // accepts a `manual-review` record on the strength of the reviewer it names (BOARD F-082). Records of that
  // method are dropped here rather than rejected, because one *is* legitimate — the one `manualReviewEvidence`
  // builds for an accepted review, which is added below from the journal.
  const declared = Array.isArray(output.evidence)
    ? (output.evidence.filter((entry) => entry && typeof entry === "object") as CriterionEvidenceRecord[])
    : [];
  const structured = declared.filter(
    (entry) => entry.verificationMethod !== "manual-review",
  );
  const manual = manualReviewEvidence(gate.journalStore, workItem.id);
  const criteria = identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []);
  if (criteria.length === 0) return { block: false };

  const pending = summarizeManualReviews(gate.journalStore, workItem.id).pending.length;
  const maxPending = gate.maxPendingManualReviews ?? 0;

  // Without structured evidence the legacy check-result path already decides
  // closure, so only pending manual reviews can add a new blocker here.
  //
  // `declared` rather than `structured` is the test, and the difference is the forger's case: a job that
  // handed in records and had all of them dropped (each one claimed to be a human decision) has *not* fallen
  // back to the legacy path — it has produced no usable evidence for a criterion that needs some, and taking
  // the legacy exit here would let a leaf close by declaring its own gate answered.
  if (structured.length === 0 && declared.length === 0) {
    if (pending > maxPending) {
      return {
        block: true,
        code: "manual_review_pending",
        field: "acceptanceCriteria",
        reason: `${pending} manual evidence review(s) are still pending; resolve them before closure.`,
      };
    }
    return { block: false };
  }

  // The producer keys its observations to the check it ran and the artifact it inspected; this fills in the
  // criterion link it did not write, so an honest job is not refused for naming things differently from the
  // plan. See `keyEvidenceToCriteria` — the proof test itself is unchanged.
  // The platform's own observations come last and are the weakest claim in the list: a criterion about a path
  // the platform is already holding is answered by reading it, instead of by asking a job whose tools are the
  // checkout's own checks to inspect a file that is merely required to be there (BOARD F-145).
  const platform = platformArtifactObservations(criteria, gate.checkoutPath);
  // A criterion about the leaf's **own report** is answered by reading the report against the record the job left, and
  // nothing else: the same reading `manualCriteriaAwaitingDecision` uses to decide it needs no question. Measured on
  // suite 19's scenario L, runs `s19r24`-`s19r28` — one report-quote criterion per leaf became one required question,
  // on every run, and the track closed `blocked` with its substance green (`report-quote.ts`).
  const reportQuotes = reportQuoteObservations(criteria, completionRecordFromJournal(gate.journalStore, workItem.id));
  const coverage = evaluateEvidenceCoverage(
    workItem,
    keyEvidenceToCriteria(criteria, [...structured, ...manual, ...platform, ...reportQuotes]),
    criteria,
    // The same reading as the two gates above: a diagnosis is not refused for recording the red check it was sent to
    // find.
    gate.evidenceOnly === true,
    gate.container === true,
    gate.baseline?.failedSubjects,
  );

  if (coverage.missing.length > 0) {
    // A criterion the emperor has **rejected** has no evidence and a decision on record, and the two call
    // for different things: one is "nobody has decided this", the other is "the decision was no".
    // Reporting the second as the first is how a rejection comes to read like a gap (BOARD F-088).
    const rejected = summarizeManualReviews(gate.journalStore, workItem.id).rejected.map(
      (review) => review.criterionId,
    );
    const rejectedMissing = coverage.missing.filter((id) => rejected.includes(id));
    const undecided = coverage.missing.filter((id) => !rejected.includes(id));
    if (undecided.length === 0) {
      return {
        block: true,
        code: "manual_review_rejected",
        field: "acceptanceCriteria",
        reason: `Rejected by the emperor, which is a decision and not missing evidence: ${rejectedMissing.join(", ")}.`,
        criterionIds: rejectedMissing,
        missing: rejectedMissing,
      };
    }
    return {
      block: true,
      code: "criteria_without_evidence",
      field: "acceptanceCriteria",
      reason: `Acceptance criteria without evidence: ${undecided.join(", ")}.`,
      criterionIds: undecided,
      missing: undecided,
    };
  }
  if (coverage.insufficient.length > 0) {
    const detail = coverage.criteria
      .filter((criterion) => criterion.status === "insufficient")
      .map((criterion) => `${criterion.criterionId}: ${criterion.reasons.join("; ")}`)
      .join(" | ");
    // A rejected review is the operator's own decision, and it must read as a rejection rather than as a
    // missing record: the two need different things from the operator.
    const rejected = summarizeManualReviews(gate.journalStore, workItem.id).rejected.map(
      (review) => review.criterionId,
    );
    const everyInsufficientRejected = coverage.insufficient.every((id) => rejected.includes(id));
    return {
      block: true,
      code: everyInsufficientRejected ? "manual_review_rejected" : "criteria_evidence_insufficient",
      field: "acceptanceCriteria",
      reason: `Evidence does not prove these criteria: ${coverage.insufficient.join(", ")}. ${detail}`,
      criterionIds: coverage.insufficient,
      missing: coverage.insufficient,
    };
  }
  if (pending > maxPending) {
    return {
      block: true,
      code: "manual_review_pending",
      field: "acceptanceCriteria",
      reason: `${pending} manual evidence review(s) are still pending; resolve them before closure.`,
    };
  }
  return { block: false };
}

export function shouldBlockDishonestSuccess(
  workItem: WorkItemRecord,
  result?: JobResultRecord,
  journalEntries: Array<{ kind: string; metadata: Record<string, unknown> }> = [],
  reportingStatus?: { completionReport: boolean; privateMemory: boolean; wikiSync?: boolean },
  evidenceGate: EvidenceGateInput = {},
): ({ block: true } & ClosureBlock) | { block: false } {
  const requiredChecks = evidenceGate.requiredChecks ?? inferRequiredChecksFromWorkItem(workItem);
  const output = jobOutput(result);
  // A container is judged by its children, whose checks were gated on each child when it closed. Its own job carries
  // their records, so reading them again here refuses the parent for a result the platform already accepted — and a
  // container cannot be retried, so nothing an operator can run clears it. Measured 2026-11-09 on suite 19 run
  // `s19r17`: \`Required checks failed: test\` on the Phase R container, with the repair beneath it done.
  const checkEval =
    evidenceGate.container === true
      ? ({ ok: true } as const)
      : evaluateJobCheckResults(
          requiredChecks,
          output.checkResults as Record<string, unknown> | undefined,
          evidenceGate.baseline?.checkResults,
        );

  const evidence = evaluateStructuredEvidence(
    workItem,
    output,
    evidenceGate.evidenceOnly === true,
    evidenceGate.container === true,
    evidenceGate.baseline?.failedSubjects,
  );
  if (evidence.failed.length > 0) {
    return {
      block: true,
      code: "evidence_failed",
      field: "evidence",
      reason: `Structured evidence failed: ${evidence.failed.join(", ")}.`,
      missing: evidence.failed,
    };
  }
  const quality = evaluateQualityGate({
    summary: typeof output.summary === "string" ? output.summary : undefined,
    iterationLimitReached: output.iterationLimitReached === true,
    requiredChecks: output.checkResults as Record<string, unknown> | undefined,
    baseline: evidenceGate.baseline,
    evidence: Array.isArray(output.evidence)
      ? (output.evidence as Array<{ passed?: unknown; verified?: unknown; reference?: unknown; subject?: unknown }>)
      : undefined,
    evidenceOnly: evidenceGate.evidenceOnly === true,
    container: evidenceGate.container === true,
  });
  if (!quality.ok) return qualityBlock(quality.reasons);

  if (jobFinishedWithoutChecks(result) && requiredChecks.length === 0 && !hasVerifiedDeliverable(output)) {
    return {
      block: true,
      code: "closure_without_checks",
      field: "job",
      reason: "Job stalled or hit the iteration limit without required checks; not marking done.",
    };
  }

  if (!checkEval.ok) {
    const [, names = ""] = checkEval.message.split(": ");
    return {
      block: true,
      code: /failed/i.test(checkEval.message) ? "checks_failed" : "checks_not_run",
      field: "checks",
      reason: checkEval.message,
      missing: names.replace(/\.$/, "").split(", ").filter(Boolean),
    };
  }

  const criterionGate = evaluateCriterionEvidenceGate(workItem, output, evidenceGate);
  if (criterionGate.block) return criterionGate;

  if (requiresPeerReview(workItem) && !hasApprovedPeerReview(journalEntries)) {
    return {
      block: true,
      code: "peer_review_required",
      field: "peerReview",
      reason: "Sensitive work requires an approved peer review before closure.",
      missing: [
        "an approved peer review: kampaku projects closure <work-item-id> --peer --accept --by <who> "
          + "--notes \"<why it passes>\"",
      ],
    };
  }

  if (requiresPeerReview(workItem) && reportingStatus && (!reportingStatus.completionReport || !reportingStatus.privateMemory || reportingStatus.wikiSync === false)) {
    return {
      block: true,
      code: "reporting_incomplete",
      field: "reporting",
      reason: "Sensitive work requires synchronized superior-journal, private-memory, and required wiki reporting before closure.",
      missing: [
        ...(reportingStatus.completionReport ? [] : ["a completion report in the superior journal"]),
        ...(reportingStatus.privateMemory ? [] : ["a private-memory entry for the assignee"]),
        ...(reportingStatus.wikiSync === false ? ["the required wiki page"] : []),
      ],
    };
  }

  if (isPhaseGateWorkItem(workItem)) {
    const summary = typeof output.summary === "string" ? output.summary : undefined;
    const repositoryPath = typeof output.repositoryPath === "string" ? output.repositoryPath : undefined;
    if (!auditArtifactIsHonest({ repositoryPath, summary })) {
      return {
        block: true,
        code: "phase_audit_missing",
        field: "phaseAudit",
        reason: "Phase auditor artifact missing or stub (need docs/audit/latest.md with verdict and score).",
      };
    }
    if (summary && isStubAuditText(summary) && !repositoryPath) {
      return {
        block: true,
        code: "phase_audit_missing",
        field: "phaseAudit",
        reason: "Phase auditor produced a stub summary without a repo artifact.",
      };
    }
  }

  return { block: false };
}

/**
 * The code for a refusal that came from `evaluateQualityGate`.
 *
 * That gate returns reasons rather than codes, and it is shared, so the code is read back out of the
 * reason it produced — the reason is what every surface renders, and a code that disagreed with it would
 * be a second answer to one question. Four reasons exist; the map is exhaustive over them.
 */
function qualityBlock(reasons: string[]): { block: true } & ClosureBlock {
  const reason = reasons.join(" ");
  if (/iteration limit reached without evidence/i.test(reason)) {
    return { block: true, code: "closure_without_checks", field: "job", reason };
  }
  if (/required checks are missing or failing/i.test(reason)) {
    return { block: true, code: "checks_failed", field: "checks", reason };
  }
  if (/unverified, or unreferenced/i.test(reason)) {
    return { block: true, code: "evidence_unreferenced", field: "evidence", reason };
  }
  return { block: true, code: "evidence_failed", field: "evidence", reason };
}

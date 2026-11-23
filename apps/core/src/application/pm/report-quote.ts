/**
 * @module application/pm/report-quote
 * A criterion about the leaf's **own report** is decided by reading the report against the job's record.
 *
 * ## What went wrong, measured
 *
 * Every leaf of suite 19's scenario L ends the same way. Its acceptance criteria include one that reads *"the
 * completion report quotes the TAP summary lines and exit code"*, and `parseCriterionChecks` routes it to
 * `request_review` — correctly, by its own rule: no tool in the worker reads a journal entry. So the criterion
 * became one required question for the operator, on every leaf, in every run (`s19r24`–`s19r28`), and the track
 * ended `blocked` with its substance green. The operator cleared it by opening the report and comparing it with the
 * check output — which is a comparison between two things the platform was already holding.
 *
 * ## The rule, and its limit
 *
 * The platform proves a report-quote criterion only when **all** of this holds:
 *
 * - the criterion is about the report (`completion report`, `the report`, `journal notes`) and says the report
 *   *quotes* something (`quotes`, `verbatim`, …);
 * - every literal the criterion quotes in backticks appears in the report **verbatim**;
 * - an exit status the criterion names is the one the report quotes, and the job's own recorded outcome agrees
 *   with it (`exit 0` only if every recorded check passed);
 * - the report contains at least one **line the job itself recorded** — a line of the check output the job's own
 *   evidence carries, twelve characters or more, and not a runner banner every run prints. This is the clause that
 *   makes the proof mechanical: the report and the record are compared, and a report that quotes invented output
 *   has nothing to compare against.
 *
 * A literal is never inferred and prose is never read for meaning. When any clause fails, **no record is
 * produced**, the criterion stays a human gate, and the leaf is refused exactly as it is today. The platform reads
 * a quote; it does not decide whether the quote is a good account of the work.
 */
import type { JournalStore } from "../../persistence/journal-store.js";
import type { CriterionEvidenceRecord } from "./evidence-review.js";

/** Words that make the criterion a claim about the leaf's own report. */
const REPORT_CLAIM = /\b(?:completion report|the report|its report|journal notes?|journal entry|the journal)\b/i;

/** Words that say what the report does with what the criterion quotes. */
const QUOTE_CLAIM = /\b(?:quotes?|quoted|quoting|verbatim|copies|repeats|transcribes)\b/i;

/** An exit-status assertion: `exit 0`, `exits 0`, `exit code 0`, `exit status 0`. */
const EXIT_STATUS = /\bexit(?:s|ed)?(?:\s+(?:code|status))?\s*[:=]?\s*(\d+)\b/i;

/** The shortest line worth reading as a quotation: below this it is punctuation or a banner. */
const MIN_QUOTED_LINE = 12;

/** Lines every runner prints, so quoting one proves nothing about this job. */
const BOILERPLATE = /^(?:TAP version \d+|\d+\.\.\d+|ok|not ok|\s*-{3,}\s*)$/i;

/**
 * Whether this criterion is a claim about what the leaf's own report quotes.
 *
 * Deliberately narrow on both halves: a criterion that mentions the report but asks for a judgement (*"the report
 * explains why the repair is right"*) is not recognised, and neither is one that asks a quote of something other
 * than the report.
 */
export function isReportQuoteCriterion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return REPORT_CLAIM.test(trimmed) && QUOTE_CLAIM.test(trimmed);
}

/** Everything the proof needs, read out of the journal: the report, and the record it is compared with. */
export interface CompletionRecordInput {
  /** What the leaf itself wrote as its report, concatenated in the order the journal holds it. */
  reportText: string;
  /** The journal entry the proof cites. */
  reference?: string;
  observedAt?: string;
  /** The job's own recorded check outcomes, `{test: true}`. */
  checks?: Record<string, unknown>;
  /** The check outputs the job's own evidence carries. */
  outputs?: string[];
}

function stringRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The report and the record of one work item, read from the journal.
 *
 * One merged reading rather than one per entry, because the two halves live in different entries and the criterion
 * is about both at once: the leaf **writes** its report through `submit_completion_report` (`refType: "work_item"`),
 * while the platform's own entry (`refType: "job"`) carries the job's output — the check outcomes and the check
 * output excerpts. Reading them separately would compare each half with nothing.
 *
 * Only the leaf's own entries are read as *the report*. The platform's generated completion entry is derived from
 * the job's output, so proving a criterion from it would prove the criterion from a template the leaf never wrote.
 */
export function completionRecordFromJournal(
  journalStore: JournalStore | undefined,
  workItemId: string,
): CompletionRecordInput | undefined {
  if (!journalStore) return undefined;
  const entries = journalStore.listForWorkItem(workItemId, { kinds: ["completion_report"], limit: 50 })
    .filter((entry) => entry.workItemId === workItemId);
  if (entries.length === 0) return undefined;

  const written = entries.filter((entry) => entry.refType === "work_item");
  const reportText = written.map((entry) => entry.body ?? "").filter(Boolean).join("\n\n");
  if (!reportText.trim()) return undefined;

  let checks: Record<string, unknown> | undefined;
  const outputs: string[] = [];
  for (const entry of entries) {
    const output = stringRecord(entry.metadata?.output);
    if (!output) continue;
    checks = checks ?? stringRecord(output.checkResults);
    const evidence = Array.isArray(output.evidence) ? output.evidence : [];
    for (const record of evidence) {
      const excerpt = stringRecord(record)?.output;
      if (typeof excerpt === "string" && excerpt.trim()) outputs.push(excerpt);
    }
  }

  const newest = written.slice().sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? "")).pop();
  return {
    reportText,
    reference: newest?.id,
    observedAt: newest?.occurredAt,
    checks,
    outputs,
  };
}

/** The literals the criterion quotes in backticks, in the order it writes them. */
function quotedLiterals(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter((literal) => literal.length > 0);
}

/** Whether the report quotes the exit status the criterion names. */
function quotesExitStatus(report: string, status: string): boolean {
  const pattern = new RegExp(`\\bexit(?:s|ed)?(?:\\s+(?:code|status))?\\s*[:=]?\\s*${status}\\b`, "i");
  return pattern.test(report);
}

/**
 * Whether the job's own record agrees with an exit status the criterion names.
 *
 * `exit 0` is a claim that every check the job ran passed; any other status is a claim that something failed. A
 * record with no outcomes in it agrees with nothing — the proof may not rest on a job that recorded no check.
 */
function recordAgreesOnOutcome(checks: Record<string, unknown> | undefined, status: string): boolean {
  const values = Object.values(checks ?? {});
  if (values.length === 0) return false;
  const allPassed = values.every((value) => value === true);
  return status === "0" ? allPassed : !allPassed;
}

/**
 * The first line of the job's own output that the report reproduces verbatim.
 *
 * Verbatim and whole: a shorter prefix would let two different results match, and a banner is not a result.
 */
function firstRecordedLineInReport(report: string, outputs: string[]): string | undefined {
  for (const output of outputs) {
    for (const raw of output.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length < MIN_QUOTED_LINE) continue;
      if (BOILERPLATE.test(line)) continue;
      if (!/[A-Za-z0-9]/.test(line)) continue;
      if (report.includes(line)) return line;
    }
  }
  return undefined;
}

function proveReportQuote(
  text: string,
  record: CompletionRecordInput,
): Omit<CriterionEvidenceRecord, "criterionId"> | undefined {
  const report = record.reportText;
  if (!report.trim()) return undefined;

  const literals = quotedLiterals(text);
  if (!literals.every((literal) => report.includes(literal))) return undefined;

  const status = text.match(EXIT_STATUS)?.[1];
  if (status !== undefined) {
    if (!quotesExitStatus(report, status)) return undefined;
    if (!recordAgreesOnOutcome(record.checks, status)) return undefined;
  }

  const quotedLine = firstRecordedLineInReport(report, record.outputs ?? []);
  if (!quotedLine) return undefined;

  return {
    subjectType: "artifact",
    format: "document",
    verificationMethod: "file-inspection",
    subject: "completion report",
    passed: true,
    verified: true,
    sourceTool: "inspect_document",
    observedAt: record.observedAt ?? new Date().toISOString(),
    reference: record.reference,
    output: `the report reproduces ${JSON.stringify(quotedLine)}, a line the job recorded itself`,
    diagnostics: { quotedLiterals: literals, exitStatus: status ?? null },
  };
}

/**
 * The report-quote criteria the platform can prove, each with the record that proves it.
 *
 * A criterion this module cannot prove produces **no** record, which is what leaves it a human gate: the caller
 * that asks the operator and the caller that judges closure both read this one list, so "not asked" and "counted as
 * covered" can never disagree.
 */
export function reportQuoteObservations(
  criteria: Array<{ id: string; text: string }>,
  record: CompletionRecordInput | undefined,
): CriterionEvidenceRecord[] {
  if (!record) return [];
  const observations: CriterionEvidenceRecord[] = [];
  for (const criterion of criteria) {
    if (!isReportQuoteCriterion(criterion.text)) continue;
    const proof = proveReportQuote(criterion.text, record);
    if (proof) observations.push({ criterionId: criterion.id, ...proof });
  }
  return observations;
}

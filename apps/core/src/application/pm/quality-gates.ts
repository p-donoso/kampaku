export interface QualityGateInput {
  summary?: string;
  iterationLimitReached?: boolean;
  requiredChecks?: Record<string, unknown>;
  evidence?: Array<{ passed?: unknown; verified?: unknown; reference?: unknown; subject?: unknown }>;
  content?: string;
  /**
   * The checks this item had to make **green**, when the caller knows them.
   *
   * Absent means the gate judges every recorded result, which is the legacy reading and the right one for a caller
   * that has nothing better: a job that recorded a failure and did not say whose it was cannot be trusted green.
   * Present means the gate judges exactly these — so a diagnosis that honestly records a red check it was never asked
   * to fix is not refused for it. Measured 2026-11-09 on suite 19 run `s19r16`: the read-only Phase A container's
   * evidence said `test: false`, the container was blocked `evidence_failed`, and every repair beneath it was
   * refused. An observation of a failure is the finding, not a lie.
   */
  requiredPassing?: readonly string[];
}

export function detectPlaceholderContent(content: string): boolean {
  return /test button|welcome to|lorem ipsum|placeholder|coming soon|demo data/i.test(content);
}

export function hasMeaningfulContent(content: string | undefined): boolean {
  return typeof content === "string" && content.trim().length >= 80 && !detectPlaceholderContent(content);
}

export function requiresBehaviorEvidence(criteria: string): boolean {
  return /ui|screen|page|form|workflow|endpoint|api|interact|navigate|click|submit/i.test(criteria);
}

export function evaluateQualityGate(input: QualityGateInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.iterationLimitReached && (!input.evidence || input.evidence.length === 0)) reasons.push("Iteration limit reached without evidence.");
  if (input.requiredChecks && Object.values(input.requiredChecks).some((value) => value !== true)) reasons.push("Required checks are missing or failing.");
  if (input.evidence?.some((entry) => entry.verified !== true || typeof entry.reference !== "string")) {
    reasons.push("Evidence is failed, unverified, or unreferenced.");
  } else if (input.evidence?.some((entry) => entry.passed !== true && judgesEvidenceEntry(entry, input.requiredPassing))) {
    reasons.push("Evidence is failed, unverified, or unreferenced.");
  }
  if (input.content && detectPlaceholderContent(input.content)) reasons.push("Placeholder or demo content detected.");
  if (input.content !== undefined && !hasMeaningfulContent(input.content)) reasons.push("Artifact content is missing or not meaningful.");
  return { ok: reasons.length === 0, reasons };
}

/**
 * Whether a failed evidence record is one this item had to make pass.
 *
 * With no scope (`requiredPassing` absent) every record is judged: that is the legacy reading, and without a scope
 * there is nothing better to judge by. With a scope, only a record naming one of those checks is judged — and both
 * spellings count, because the dispatch reads `test` while a worker's `run_check` record often writes the concrete
 * member (`checks/test_parse.py`).
 */
function judgesEvidenceEntry(
  entry: { subject?: unknown },
  requiredPassing: readonly string[] | undefined,
): boolean {
  if (requiredPassing === undefined) return true;
  const subject = typeof entry.subject === "string" ? entry.subject.replace(/^\.\//, "").trim() : "";
  if (!subject) return false;
  return requiredPassing.some((name) => {
    const required = name.replace(/^\.\//, "").trim();
    return required === subject || required.endsWith(`/${subject}`) || subject.endsWith(`/${required}`);
  });
}

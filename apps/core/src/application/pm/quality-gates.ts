export interface QualityGateInput {
  summary?: string;
  iterationLimitReached?: boolean;
  requiredChecks?: Record<string, unknown>;
  evidence?: Array<{ passed?: unknown; verified?: unknown; reference?: unknown; subject?: unknown }>;
  content?: string;
  /**
   * Whether this item was asked to **observe** rather than to change anything.
   *
   * An observation records what it saw, red or green, and a red it recorded is the finding. Absent or false, every
   * recorded failure counts — including one nobody required, because then no one has claimed it and closing over it
   * is the platform accepting a red check on nobody's word (`eval 14/24`: *cannot paper over a check the job reported
   * as failed*).
   *
   * Measured 2026-11-09 on suite 19 run `s19r16`: the read-only Phase A container's job carried its children's
   * evidence, `test: false` among it — the honest record of a runner that is red because the repository is broken —
   * and the container was blocked `evidence_failed`, refusing every repair beneath it.
   */
  evidenceOnly?: boolean;
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
  if (input.evidenceOnly !== true && input.requiredChecks && failedCheckRecords(input.requiredChecks).length > 0) {
    reasons.push("Required checks are missing or failing.");
  }
  if (input.evidence?.some((entry) => entry.verified !== true || typeof entry.reference !== "string")) {
    reasons.push("Evidence is failed, unverified, or unreferenced.");
  } else if (input.evidenceOnly !== true && input.evidence?.some((entry) => entry.passed !== true)) {
    reasons.push("Evidence is failed, unverified, or unreferenced.");
  }
  if (input.content && detectPlaceholderContent(input.content)) reasons.push("Placeholder or demo content detected.");
  if (input.content !== undefined && !hasMeaningfulContent(input.content)) reasons.push("Artifact content is missing or not meaningful.");
  return { ok: reasons.length === 0, reasons };
}

/**
 * The recorded check results that count against this item: every one that is not `true`.
 *
 * Kept as a function so the reason text stays one line at the call site, and so the rule is stated once: a recorded
 * failure is a failure. Whether it is *this* item's failure is decided by `evidenceOnly`, not by which check the
 * dispatch required — the two questions are different, and a job that recorded a red check nobody required still
 * cannot be closed over.
 */
function failedCheckRecords(records: Record<string, unknown>): string[] {
  return Object.entries(records)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
}

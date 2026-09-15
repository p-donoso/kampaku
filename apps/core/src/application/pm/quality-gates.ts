export interface QualityGateInput { summary?: string; iterationLimitReached?: boolean; requiredChecks?: Record<string, unknown>; evidence?: Array<{ passed?: unknown; verified?: unknown; reference?: unknown }>; content?: string }

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
  if (input.evidence?.some((entry) => entry.passed !== true || entry.verified !== true || typeof entry.reference !== "string")) reasons.push("Evidence is failed, unverified, or unreferenced.");
  if (input.content && detectPlaceholderContent(input.content)) reasons.push("Placeholder or demo content detected.");
  if (input.content !== undefined && !hasMeaningfulContent(input.content)) reasons.push("Artifact content is missing or not meaningful.");
  return { ok: reasons.length === 0, reasons };
}

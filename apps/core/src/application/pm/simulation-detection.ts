export interface SimulationScan { content: string; declaredFixture?: boolean; }

export function requiresDynamicEvidence(requirement: string): boolean {
  return /persist|save|calculate|compute|generate|update|state change|workflow|personaliz|dynamic/i.test(requirement);
}

export function requiresProvenance(deliverable: string): boolean {
  return /research|data|media|document|generated|transcri|source|citation/i.test(deliverable);
}

export function dynamicEvidenceSatisfied(before: string, after: string): boolean {
  return before !== after;
}

export function needsSimulationReview(scan: { suspicious: boolean; reasons: string[] }, declaredFixture = false): boolean {
  return scan.suspicious && !declaredFixture && scan.reasons.length > 0;
}

export function detectPlaceholderText(content: string): string[] {
  const patterns = [/lorem ipsum/gi, /coming soon/gi, /test button/gi, /placeholder/gi, /welcome to the demo/gi];
  return patterns.flatMap((pattern) => content.match(pattern) ?? []);
}

export function detectSuspiciousConstants(content: string): string[] {
  if (/fixture|example|seed|mock|sample/i.test(content)) return [];
  const matches = content.match(/\b(?:xp|score|streak|count|total|progress|lessons?|words?)\s*[:=]\s*["']?\d+["']?/gi) ?? [];
  return [...new Set(matches)];
}

export function scanSimulation(input: SimulationScan): { suspicious: boolean; reasons: string[] } {
  if (input.declaredFixture) return { suspicious: false, reasons: [] };
  const reasons = [...detectPlaceholderText(input.content).map((item) => `Placeholder detected: ${item}`), ...detectSuspiciousConstants(input.content).map((item) => `Suspicious constant: ${item}`)];
  return { suspicious: reasons.length > 0, reasons };
}

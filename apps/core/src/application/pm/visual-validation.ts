export interface VisualObservation { artifact: string; viewport?: { width: number; height: number }; accessibilityChecked: boolean; requirementRefs: string[]; metadata: Record<string, string>; }

export function validateVisualObservation(observation: VisualObservation): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!observation.artifact.trim()) issues.push("Visual observation requires an artifact reference.");
  if (observation.viewport && (observation.viewport.width < 1 || observation.viewport.height < 1)) issues.push("Viewport dimensions must be positive.");
  if (!observation.accessibilityChecked) issues.push("Accessibility inspection is required for visual outcomes.");
  if (observation.requirementRefs.length === 0) issues.push("Visual observation must reference requirements.");
  if (Object.keys(observation.metadata).length === 0) issues.push("Visual observation must preserve runtime metadata.");
  return { ok: issues.length === 0, issues };
}

export function compareVisualReferences(expected: string, actual: string): { equal: boolean; expected: string; actual: string } {
  return { equal: expected === actual, expected, actual };
}

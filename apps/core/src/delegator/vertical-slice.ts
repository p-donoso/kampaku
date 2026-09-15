export interface VerticalSlice {
  id: string;
  title: string;
  outcome: string;
  requirementIds: string[];
  workItemIds: string[];
  evidenceKinds: string[];
}

export interface VerticalSliceValidation { ok: boolean; issues: string[] }

export function validateVerticalSlice(slice: VerticalSlice): VerticalSliceValidation {
  const issues: string[] = [];
  if (!slice.title.trim()) issues.push("Slice title is required.");
  if (!slice.outcome.trim()) issues.push("Slice must define an observable outcome.");
  if (slice.requirementIds.length === 0) issues.push("Slice must map to at least one objective requirement.");
  if (slice.workItemIds.length === 0) issues.push("Slice must map to at least one work item.");
  if (slice.evidenceKinds.length === 0) issues.push("Slice must declare how its outcome will be evidenced.");
  return { ok: issues.length === 0, issues };
}

export function validateVerticalSlicePlan(slices: VerticalSlice[]): VerticalSliceValidation {
  const issues = slices.flatMap((slice) => validateVerticalSlice(slice).issues.map((issue) => `${slice.id}: ${issue}`));
  if (slices.length === 0) issues.push("Plan must contain at least one vertical slice.");
  return { ok: issues.length === 0, issues };
}

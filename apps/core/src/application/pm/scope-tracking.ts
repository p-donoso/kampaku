export interface ScopeRequirement { id: string; description: string; status: "planned" | "deferred" | "rejected"; reason?: string }

export interface ScopeChange { requirementId: string; from: ScopeRequirement["status"]; to: ScopeRequirement["status"]; reason: string; recordedAt: string }

export function validateScope(requirements: ScopeRequirement[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const requirement of requirements) {
    if (requirement.status !== "planned" && !requirement.reason?.trim()) issues.push(`${requirement.id} requires a scope reason.`);
  }
  if (new Set(requirements.map((item) => item.id)).size !== requirements.length) issues.push("Requirement IDs must be unique.");
  return { ok: issues.length === 0, issues };
}

export function createScopeChange(requirementId: string, from: ScopeRequirement["status"], to: ScopeRequirement["status"], reason: string): ScopeChange {
  if (!reason.trim()) throw new Error("Scope changes require a reason.");
  return { requirementId, from, to, reason, recordedAt: new Date().toISOString() };
}

export function buildScopeReport(requirements: ScopeRequirement[]): { planned: ScopeRequirement[]; deferred: ScopeRequirement[]; rejected: ScopeRequirement[] } {
  return { planned: requirements.filter((item) => item.status === "planned"), deferred: requirements.filter((item) => item.status === "deferred"), rejected: requirements.filter((item) => item.status === "rejected") };
}

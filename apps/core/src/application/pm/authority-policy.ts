export type AuthorityRole = "planner" | "implementer" | "auditor" | "emperor";
export type AuthorityAction = "plan" | "implement" | "approve" | "reopen" | "override";

export interface AuthorityOverride {
  actor: AuthorityRole;
  action: AuthorityAction;
  reason: string;
  evidence: string[];
  recordedAt: string;
}

export function mayPerform(role: AuthorityRole, action: AuthorityAction): boolean {
  if (role === "emperor") return true;
  if (role === "planner") return action === "plan";
  if (role === "implementer") return action === "implement";
  return action === "approve" || action === "reopen" || action === "override";
}

export function assertIndependentApproval(author: AuthorityRole, approver: AuthorityRole): void {
  if (author === approver && author !== "emperor") throw new Error("A deliverable requires independent approval.");
}

export function createOverride(actor: AuthorityRole, action: AuthorityAction, reason: string, evidence: string[]): AuthorityOverride {
  if (!mayPerform(actor, action)) throw new Error(`Role ${actor} cannot perform ${action}.`);
  if (!reason.trim() || evidence.length === 0) throw new Error("Overrides require a reason and evidence.");
  return { actor, action, reason, evidence, recordedAt: new Date().toISOString() };
}

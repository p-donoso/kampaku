export type HonestProjectStatus = "implemented" | "partial" | "missing" | "blocked" | "unverified";
export interface ProjectStatusRecord { status: HonestProjectStatus; reason: string; evidence: string[]; recordedAt: string }
export function createProjectStatus(status: HonestProjectStatus, reason: string, evidence: string[] = []): ProjectStatusRecord {
  if (!reason.trim()) throw new Error("Project status requires a reason.");
  if ((status === "implemented" || status === "partial") && evidence.length === 0) throw new Error("Implemented status requires evidence.");
  return { status, reason, evidence, recordedAt: new Date().toISOString() };
}

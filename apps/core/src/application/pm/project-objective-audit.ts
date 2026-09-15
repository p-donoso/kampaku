/** Project-agnostic final coverage audit. It intentionally operates on evidence, not file types. */
export type ObjectiveRequirementStatus = "covered" | "partial" | "missing" | "blocked" | "unverified";

export interface ObjectiveRequirement {
  id: string;
  description: string;
  critical?: boolean;
}

/** Build stable requirement records from explicit objective lines or plan criteria. */
export function normalizeObjectiveRequirements(objective: string, plannedCriteria: string[] = []): ObjectiveRequirement[] {
  const lines = objective.split(/\n|[.;]+/).map((line) => line.replace(/^[-*\d.)\s]+/, "").trim()).filter((line) => line.length >= 12);
  const candidates = lines.length > 0 ? lines : plannedCriteria;
  return [...new Map(candidates.map((description, index) => {
    const id = `req-${index + 1}-${description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}`;
    return [id, { id, description, critical: index === 0 }];
  })).values()];
}

export interface RequirementEvidence {
  requirementId: string;
  passed: boolean;
  verified: boolean;
  blocked?: boolean;
  reference?: string;
}

export interface ObjectiveCoverageReport {
  verdict: ObjectiveCoverageResult["verdict"];
  markdown: string;
  machine: ObjectiveCoverageResult;
}

export interface ObjectiveCoverageResult {
  verdict: "pass" | "conditional" | "fail";
  requirements: Array<ObjectiveRequirement & { status: ObjectiveRequirementStatus; evidence: RequirementEvidence[] }>;
}

export function auditObjectiveCoverage(
  requirements: ObjectiveRequirement[],
  evidence: RequirementEvidence[],
): ObjectiveCoverageResult {
  const rows = requirements.map((requirement) => {
    const matches = evidence.filter((entry) => entry.requirementId === requirement.id);
    let status: ObjectiveRequirementStatus = "missing";
    if (matches.some((entry) => entry.blocked)) status = "blocked";
    else if (matches.some((entry) => entry.passed && entry.verified && entry.reference)) status = "covered";
    else if (matches.some((entry) => entry.passed && !entry.reference)) status = "unverified";
    else if (matches.some((entry) => entry.passed)) status = "unverified";
    else if (matches.length > 0) status = "partial";
    return { ...requirement, status, evidence: matches };
  });
  const criticalGap = rows.some((row) => row.critical && row.status !== "covered");
  const anyGap = rows.some((row) => row.status !== "covered");
  return { verdict: criticalGap ? "fail" : anyGap ? "conditional" : "pass", requirements: rows };
}

export function buildObjectiveCoverageReport(
  objective: string,
  requirements: ObjectiveRequirement[],
  evidence: RequirementEvidence[],
): ObjectiveCoverageReport {
  const machine = auditObjectiveCoverage(requirements, evidence);
  const lines = [`# Objective Coverage Audit`, ``, `Objective: ${objective}`, ``, `Verdict: ${machine.verdict}`, ``, `| Requirement | Status | Evidence |`, `| --- | --- | --- |`];
  for (const row of machine.requirements) {
    const refs = row.evidence.map((item) => item.reference ?? "unreferenced").join(", ") || "none";
    lines.push(`| ${row.description} | ${row.status} | ${refs} |`);
  }
  return { verdict: machine.verdict, markdown: `${lines.join("\n")}\n`, machine };
}

export function assertObjectiveCompletion(result: ObjectiveCoverageResult): void {
  if (result.verdict === "fail") throw new Error("Project objective audit failed: critical requirements are missing, blocked, partial, or unverified.");
}

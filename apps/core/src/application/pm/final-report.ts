import type { ObjectiveCoverageResult } from "./project-objective-audit.js";

export interface FinalReportInput { objective: string; planSummary: string; implementationSummary: string; coverage: ObjectiveCoverageResult; risks: string[]; followUps: string[] }

export function buildFinalReport(input: FinalReportInput): { markdown: string; machine: FinalReportInput } {
  const lines = ["# Final Project Report", "", "## Objective", input.objective, "", "## Approved plan", input.planSummary, "", "## Implementation", input.implementationSummary, "", `## Verdict: ${input.coverage.verdict}`, "", "## Requirement coverage", "| Requirement | Status | Evidence |", "| --- | --- | --- |"];
  for (const requirement of input.coverage.requirements) lines.push(`| ${requirement.description} | ${requirement.status} | ${requirement.evidence.map((item) => item.reference ?? "unreferenced").join(", ") || "none"} |`);
  lines.push("", "## Risks", ...(input.risks.length ? input.risks.map((risk) => `- ${risk}`) : ["- None recorded."]), "", "## Follow-ups", ...(input.followUps.length ? input.followUps.map((item) => `- ${item}`) : ["- None recorded."]));
  return { markdown: `${lines.join("\n")}\n`, machine: input };
}

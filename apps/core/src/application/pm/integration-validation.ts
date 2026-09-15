export type IntegrationScenarioKind = "primary" | "failure" | "recovery";

export interface IntegrationScenario {
  id: string;
  kind: IntegrationScenarioKind;
  outcome: string;
  boundaries: string[];
  passed: boolean;
  evidence?: string;
}

export interface IntegrationValidationReport {
  ok: boolean;
  scenarios: IntegrationScenario[];
  diagnostics: string[];
}

export function validateIntegrationScenarios(scenarios: IntegrationScenario[]): IntegrationValidationReport {
  const diagnostics: string[] = [];
  for (const kind of ["primary", "failure", "recovery"] as const) {
    if (!scenarios.some((scenario) => scenario.kind === kind)) diagnostics.push(`Missing ${kind} integration scenario.`);
  }
  for (const scenario of scenarios) {
    if (scenario.boundaries.length < 2) diagnostics.push(`Scenario ${scenario.id} does not cross relevant boundaries.`);
    if (!scenario.passed) diagnostics.push(`Scenario ${scenario.id} failed.`);
    if (!scenario.evidence) diagnostics.push(`Scenario ${scenario.id} has no evidence.`);
  }
  return { ok: diagnostics.length === 0, scenarios, diagnostics };
}

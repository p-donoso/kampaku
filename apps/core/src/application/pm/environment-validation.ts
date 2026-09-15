export type EnvironmentConstraintKind = "runtime" | "dependency" | "schema" | "service" | "operation";

export interface EnvironmentConstraint {
  id: string;
  kind: EnvironmentConstraintKind;
  description: string;
  compatible: boolean;
  evidence?: string;
}

export interface MinimumOperation {
  name: string;
  passed: boolean;
  evidence?: string;
}

export interface EnvironmentValidationReport {
  compatible: boolean;
  constraints: EnvironmentConstraint[];
  minimumOperation?: MinimumOperation;
  diagnostics: string[];
}

export function validateEnvironment(
  constraints: EnvironmentConstraint[],
  minimumOperation?: MinimumOperation,
): EnvironmentValidationReport {
  const diagnostics = constraints
    .filter((constraint) => !constraint.compatible)
    .map((constraint) => `${constraint.kind}: ${constraint.description}`);
  if (minimumOperation && !minimumOperation.passed) diagnostics.push(`operation: ${minimumOperation.name}`);
  return {
    compatible: diagnostics.length === 0,
    constraints,
    minimumOperation,
    diagnostics,
  };
}

export function requiresMinimumOperation(constraints: EnvironmentConstraint[]): boolean {
  return constraints.some((constraint) => ["schema", "service"].includes(constraint.kind));
}

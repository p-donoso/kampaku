export interface StarterTemplateManifest {
  name: string;
  capabilities: string[];
  requiredChecks: string[];
  hasDocumentation: boolean;
  examplesSeparated: boolean;
}

export function validateStarterTemplate(template: StarterTemplateManifest): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!template.name.trim()) issues.push("Template name is required.");
  if (template.capabilities.length === 0) issues.push("Template must declare capabilities.");
  if (template.requiredChecks.length === 0) issues.push("Template must declare runnable checks.");
  if (!template.hasDocumentation) issues.push("Template must include documentation.");
  if (!template.examplesSeparated) issues.push("Examples and fixtures must be separated from production behavior.");
  return { ok: issues.length === 0, issues };
}

export interface DomainSkillManifest { name: string; responsibilities: string[]; checks: string[]; evidenceGuidance: string[]; domains: string[] }

export function validateDomainSkill(skill: DomainSkillManifest): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!skill.name.trim()) issues.push("Skill name is required.");
  if (skill.responsibilities.length === 0) issues.push("Skill must declare bounded responsibilities.");
  if (skill.checks.length === 0) issues.push("Skill must provide verification guidance.");
  if (skill.evidenceGuidance.length === 0) issues.push("Skill must provide evidence guidance.");
  if (skill.domains.length === 0) issues.push("Skill must declare applicable domains.");
  return { ok: issues.length === 0, issues };
}

export function composeDomainSkills(skills: DomainSkillManifest[]): { ok: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  const responsibilities = new Map<string, string>();
  for (const skill of skills) for (const responsibility of skill.responsibilities) {
    const owner = responsibilities.get(responsibility);
    if (owner && owner !== skill.name) conflicts.push(`Responsibility conflict: ${responsibility} (${owner}, ${skill.name})`);
    responsibilities.set(responsibility, skill.name);
  }
  return { ok: conflicts.length === 0, conflicts };
}

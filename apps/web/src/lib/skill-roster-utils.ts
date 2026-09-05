import type { SkillRecord } from "./types";

export type SkillFilter = "all" | "assigned" | "unassigned";
export type SkillSortKey = "name" | "slug" | "agents";

export function computeSkillCounts(skills: SkillRecord[]) {
  const assigned = skills.filter((skill) => (skill.assignedAgentSlugs?.length ?? 0) > 0).length;
  return {
    total: skills.length,
    assigned,
    unassigned: skills.length - assigned,
  };
}

export function filterSkills(
  skills: SkillRecord[],
  filter: SkillFilter,
  search: string,
): SkillRecord[] {
  let result = skills;

  if (filter === "assigned") {
    result = result.filter((skill) => (skill.assignedAgentSlugs?.length ?? 0) > 0);
  } else if (filter === "unassigned") {
    result = result.filter((skill) => !(skill.assignedAgentSlugs?.length ?? 0));
  }

  const q = search.trim().toLowerCase();
  if (!q) return result;

  return result.filter(
    (skill) =>
      skill.slug.toLowerCase().includes(q) ||
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.capabilities.some((cap) => cap.toLowerCase().includes(q)) ||
      skill.tools.some((tool) => tool.toLowerCase().includes(q)),
  );
}

export function sortSkills(
  skills: SkillRecord[],
  sortKey: SkillSortKey,
  sortDesc: boolean,
): SkillRecord[] {
  const sorted = [...skills].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === "slug") {
      cmp = a.slug.localeCompare(b.slug);
    } else if (sortKey === "agents") {
      cmp =
        (a.assignedAgentSlugs?.length ?? 0) - (b.assignedAgentSlugs?.length ?? 0);
    }
    return sortDesc ? -cmp : cmp;
  });
  return sorted;
}

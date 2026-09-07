import { SkillsManagement } from "@/components/agents/skills-view";
import { listSkills } from "@/lib/api";

export default async function SkillsPage() {
  let skills: Awaited<ReturnType<typeof listSkills>>["skills"] = [];
  let error: string | null = null;

  try {
    const res = await listSkills();
    skills = res.skills ?? [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to core";
  }

  if (error && !skills.length) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return <SkillsManagement initialSkills={skills} />;
}

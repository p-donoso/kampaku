import { AgentsPageFrame } from "@/components/agents/agents-page-frame";
import { SkillsManagement } from "@/components/agents/skills-management";
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

  return (
    <AgentsPageFrame
      description={
        error ? error : `${skills.length} skills · assignable capability catalog`
      }
    >
      {error && !skills.length ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <SkillsManagement initialSkills={skills} />
      )}
    </AgentsPageFrame>
  );
}

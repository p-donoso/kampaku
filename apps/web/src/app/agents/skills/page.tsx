import { AgentsSubNav } from "@/components/agents/agents-sub-nav";
import { SkillsManagement } from "@/components/agents/skills-management";
import { PageHeader } from "@/components/ui/page-header";
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
    <>
      <PageHeader
        title="Agents"
        description={
          error ? error : `${skills.length} skills · assignable capability catalog`
        }
      />

      <AgentsSubNav />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">
          {error && !skills.length ? (
            <p className="text-sm text-error">{error}</p>
          ) : (
            <SkillsManagement initialSkills={skills} />
          )}
        </div>
      </div>
    </>
  );
}

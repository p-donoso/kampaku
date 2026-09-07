import { ProjectsManagement } from "@/components/projects/project-management";
import { ProjectsSubNav } from "@/components/projects/projects-sub-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getProjectsRoster } from "@/lib/api";

export default async function ProjectsPage() {
  let projects: Awaited<ReturnType<typeof getProjectsRoster>>["projects"] = [];
  let error: string | null = null;

  try {
    const res = await getProjectsRoster();
    projects = res.projects;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to connect to core";
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          error ?? `${projects.length} projects · progress, execution, and attention`
        }
      />

      <ProjectsSubNav />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">
          {error && !projects.length ? (
            <p className="text-sm text-error">{error}</p>
          ) : (
            <ProjectsManagement initialProjects={projects} />
          )}
        </div>
      </div>
    </>
  );
}

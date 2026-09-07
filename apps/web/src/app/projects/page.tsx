import { ProjectsManagement } from "@/components/projects/project-management";
import { ProjectsPageFrame } from "@/components/projects/projects-page-frame";
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
    <ProjectsPageFrame
      description={
        error ?? `${projects.length} projects · progress, execution, and attention`
      }
    >
      {error && !projects.length ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <ProjectsManagement initialProjects={projects} />
      )}
    </ProjectsPageFrame>
  );
}

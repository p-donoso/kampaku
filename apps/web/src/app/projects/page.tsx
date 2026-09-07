import { ProjectsManagement } from "@/components/projects/projects-view";
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

  if (error && !projects.length) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return <ProjectsManagement initialProjects={projects} />;
}

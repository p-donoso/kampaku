import { ProjectsPageFrame } from "@/components/projects/projects-page-frame";
import { WikiManagement } from "@/components/wiki/wiki-management";
import { listProjects } from "@/lib/api";

export default async function WikiPage() {
  let projects: Awaited<ReturnType<typeof listProjects>>["projects"] = [];
  let error: string | null = null;

  try {
    projects = (await listProjects()).projects;
  } catch (e) {
    error = e instanceof Error ? e.message : "Error connecting to core";
  }

  return (
    <ProjectsPageFrame description={error ?? "Documentation and shared knowledge across all projects"}>
      {error && !projects.length ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <WikiManagement projects={projects} />
      )}
    </ProjectsPageFrame>
  );
}

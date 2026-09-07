import { JournalManagement } from "@/components/journal/journal-management";
import { ProjectsPageFrame } from "@/components/projects/projects-page-frame";
import { listProjects } from "@/lib/api";

export default async function JournalPage() {
  let projects: Awaited<ReturnType<typeof listProjects>>["projects"] = [];
  let error: string | null = null;

  try {
    projects = (await listProjects()).projects;
  } catch (e) {
    error = e instanceof Error ? e.message : "Error connecting to core";
  }

  return (
    <ProjectsPageFrame description={error ?? "Project activity and agent communication"}>
      {error && !projects.length ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <JournalManagement initialProjects={projects} />
      )}
    </ProjectsPageFrame>
  );
}

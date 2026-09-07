import { JournalManagement } from "@/components/journal/journal-management";
import { ProjectsSubNav } from "@/components/projects/projects-sub-nav";
import { PageHeader } from "@/components/ui/page-header";
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
    <>
      <PageHeader title="Projects" description={error ?? "Project activity and agent communication"} />
      <ProjectsSubNav />
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
        <div className="mx-auto max-w-7xl">
          {error && !projects.length ? (
            <p className="text-sm text-error">{error}</p>
          ) : (
            <JournalManagement initialProjects={projects} />
          )}
        </div>
      </div>
    </>
  );
}

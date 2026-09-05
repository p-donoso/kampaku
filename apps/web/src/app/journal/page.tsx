import { JournalManagement } from "@/components/journal-management";
import { listProjects } from "@/lib/api";

export default async function JournalPage() {
  let projects: Awaited<ReturnType<typeof listProjects>>["projects"] = [];
  let error: string | null = null;

  try {
    const res = await listProjects();
    projects = res.projects;
  } catch (e) {
    error = e instanceof Error ? e.message : "Error connecting to core";
  }

  return (
    <>
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Journal</h1>
        <p className="text-sm text-muted">
          {error ?? "Communication timeline between agents across projects"}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl">
          {error && !projects.length ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <JournalManagement initialProjects={projects} />
          )}
        </div>
      </div>
    </>
  );
}

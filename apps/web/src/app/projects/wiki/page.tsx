import { WikiManagement } from "@/components/wiki/wiki-view";
import { listProjects } from "@/lib/api";

export default async function WikiPage() {
  let projects: Awaited<ReturnType<typeof listProjects>>["projects"] = [];
  let error: string | null = null;

  try {
    projects = (await listProjects()).projects;
  } catch (e) {
    error = e instanceof Error ? e.message : "Error connecting to core";
  }

  if (error && !projects.length) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return <WikiManagement projects={projects} />;
}

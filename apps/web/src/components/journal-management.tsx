"use client";

import { useEffect, useState } from "react";
import { WorkItemJournalTimeline } from "@/components/work-item-journal-timeline";
import { getProjectOverview, listProjects } from "@/lib/api";
import type { ProjectOverview, ProjectRecord } from "@/lib/types";

export function JournalManagement({
  initialProjects,
}: {
  initialProjects: ProjectRecord[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]?.id ?? "");
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProjects.length > 0) return;
    void listProjects()
      .then((res) => {
        setProjects(res.projects);
        setSelectedProjectId((current) => current || res.projects[0]?.id || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [initialProjects.length]);

  useEffect(() => {
    const project = projects.find((item) => item.id === selectedProjectId);
    if (!project?.slug) {
      setOverview(null);
      return;
    }

    setLoadingOverview(true);
    void getProjectOverview(project.slug)
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingOverview(false));
  }, [projects, selectedProjectId]);

  if (!projects.length) {
    return <p className="text-sm text-muted">No projects available.</p>;
  }

  const selectedProject = projects.find((item) => item.id === selectedProjectId);

  return (
    <div className="space-y-4">
      <label className="flex max-w-md flex-col gap-1 text-xs text-secondary">
        Project
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loadingOverview && !overview && (
        <p className="text-sm text-muted">Loading project journal…</p>
      )}

      {selectedProject && overview && (
        <section className="rounded-xl border border-border bg-surface/30 p-4">
          <h2 className="mb-1 text-sm font-medium text-foreground">{selectedProject.name}</h2>
          <p className="mb-4 text-xs text-muted">
            Agent communication timeline — delegations, reports, questions, blockers, and audit proposals.
          </p>
          <WorkItemJournalTimeline projectId={selectedProject.id} workItems={overview.workItems} />
        </section>
      )}
    </div>
  );
}

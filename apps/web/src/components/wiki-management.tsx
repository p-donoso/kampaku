"use client";

import { useState } from "react";
import { ProjectWikiPanel } from "@/components/project-wiki-panel";
import type { ProjectRecord } from "@/lib/types";

export function WikiManagement({ projects }: { projects: ProjectRecord[] }) {
  const [selectedSlug, setSelectedSlug] = useState(projects[0]?.slug ?? "");

  if (!projects.length) return <p className="text-sm text-muted">No projects available.</p>;

  const selectedProject = projects.find((project) => project.slug === selectedSlug) ?? projects[0]!;

  return (
    <div className="space-y-4">
      <label className="flex max-w-md flex-col gap-1 text-xs text-secondary">
        Project
        <select
          value={selectedProject.slug}
          onChange={(event) => setSelectedSlug(event.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.slug}>{project.name}</option>
          ))}
        </select>
      </label>
      <section>
        <div className="mb-4 border-b border-border pb-3">
          <h2 className="text-sm font-medium text-foreground">{selectedProject.name}</h2>
          <p className="text-xs text-muted">Browse this project’s pages, links, and discussions.</p>
        </div>
        <ProjectWikiPanel key={selectedProject.slug} projectSlug={selectedProject.slug} />
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import { DetailPanelError, DetailPanelLoading } from "@/components/panels/detail-panel-state";
import { useDetailPanel } from "@/components/panels/detail-panel-context";
import { usePanels } from "@/components/panels/panel-provider";
import { formatUserFacingError, isNotFoundError } from "@/lib/api-errors";
import { collectProjectAgents, flattenAgentTree } from "@/lib/agent-project-links";
import { getProjectOverview, listAgents, updateProject } from "@/lib/api";
import type { AgentRecord, ProjectOverview } from "@/lib/types";

type ProjectDraft = {
  name: string;
  description: string;
};

function toDraft(overview: ProjectOverview): ProjectDraft {
  return {
    name: overview.project.name,
    description: overview.project.description ?? "",
  };
}

const detailTextareaClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50";

export function ProjectDetailContent({ slug }: { slug: string }) {
  const { editing, registerHandlers } = useDetailPanel();
  const { close, onEntityNotFound } = usePanels();
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [agentsById, setAgentsById] = useState<Map<string, AgentRecord>>(() => new Map());
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return Promise.all([getProjectOverview(slug), listAgents()]).then(
      ([overviewData, agentsRes]) => {
        setOverview(overviewData);
        setDraft(toDraft(overviewData));
        setAgentsById(
          new Map(flattenAgentTree(agentsRes.tree ?? []).map((agent) => [agent.id, agent])),
        );
        setError(null);
      },
    );
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);
    setDraft(null);

    reload()
      .catch((e) => {
        if (cancelled) return;
        if (isNotFoundError(e)) {
          onEntityNotFound("project", slug);
          return;
        }
        setError(formatUserFacingError(e, { entityType: "project", action: "load" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload, slug, onEntityNotFound]);

  useEffect(() => {
    if (!overview || !draft) return;

    registerHandlers({
      canDelete: overview.project.slug !== "kampaku",
      deleteConfirmMessage: `Delete project "${overview.project.name}"? Associated documents and tasks will be removed.`,
      onSave: async () => {
        const projectPatch: { name?: string; description?: string } = {};
        if (draft.name.trim() !== overview.project.name) {
          projectPatch.name = draft.name.trim();
        }
        if (draft.description !== (overview.project.description ?? "")) {
          projectPatch.description = draft.description;
        }

        if (Object.keys(projectPatch).length > 0) {
          await updateProject(slug, projectPatch);
        }

        await reload();
      },
      onCancel: () => {
        setDraft(toDraft(overview));
      },
    });
  }, [draft, overview, registerHandlers, reload, slug]);

  const projectAgents = useMemo(
    () => (overview ? collectProjectAgents(overview, agentsById) : []),
    [overview, agentsById],
  );

  if (loading && !overview) {
    return <DetailPanelLoading label="Loading project…" />;
  }

  if (error && !overview) {
    return (
      <DetailPanelError
        title="Could not load project"
        message={error}
        actionLabel="Close"
        onAction={close}
      />
    );
  }

  if (!overview || !draft) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((prev) => prev && { ...prev, name: event.target.value })}
                className={detailTextareaClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Description</span>
              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, description: event.target.value })
                }
                rows={3}
                className={`${detailTextareaClass} resize-y`}
              />
            </label>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{overview.project.description || "No description"}</p>
        )}
      </div>
      <ProjectDetailTabs overview={overview} projectAgents={projectAgents} />
    </div>
  );
}

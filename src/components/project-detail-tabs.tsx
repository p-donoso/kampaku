"use client";

import { useState, type ReactNode } from "react";
import { DetailTabNav } from "@/components/detail-tab-nav";
import { usePanels } from "@/components/panel-provider";
import { ProjectTasks } from "@/components/project-tasks";
import { WorkItemJournalTimeline } from "@/components/work-item-journal-timeline";
import { ProjectWikiPanel } from "@/components/project-wiki-panel";
import { ProjectSummaryPanel, type ProjectDetailTab } from "@/components/project-summary-panel";
import type { ProjectAgentEntry } from "@/lib/agent-project-links";
import type { ProjectOverview } from "@/lib/types";

type Tab = ProjectDetailTab;

export function ProjectDetailTabs({
  overview,
  projectAgents,
}: {
  overview: ProjectOverview;
  projectAgents: ProjectAgentEntry[];
}) {
  const [tab, setTab] = useState<Tab>("tasks");
  const { project, workItems } = overview;
  const rootTaskCount = workItems.length;

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary", label: "Summary" },
    { id: "tasks", label: "Tasks", count: rootTaskCount || undefined },
    { id: "journal", label: "Journal" },
    { id: "wiki", label: "Wiki" },
    { id: "agents", label: "Agents", count: projectAgents.length || undefined },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DetailTabNav tabs={tabs} active={tab} onChange={setTab} ariaLabel="Project detail" />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "summary" && (
          <ProjectSummaryPanel
            overview={overview}
            projectAgents={projectAgents}
            onNavigateTab={setTab}
          />
        )}
        {tab === "tasks" && (
          <ProjectTasks projectSlug={project.slug} projectId={project.id} workItems={workItems} />
        )}
        {tab === "journal" && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">Communication journal</h3>
            <WorkItemJournalTimeline projectId={project.id} workItems={workItems} />
          </section>
        )}
        {tab === "wiki" && <ProjectWikiPanel projectSlug={project.slug} />}
        {tab === "agents" && (
          <AgentsTab projectAgents={projectAgents} />
        )}
      </div>
    </div>
  );
}

function AgentsTab({ projectAgents }: { projectAgents: ProjectAgentEntry[] }) {
  const { openAgent } = usePanels();

  if (!projectAgents.length) {
    return <Empty>No agents assigned to this project.</Empty>;
  }

  return (
    <div className="space-y-3">
      {projectAgents.map(({ agent, role, taskCount }) => (
        <article
          key={agent.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-100">{agent.name}</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                {agent.slug}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  role === "lead" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {role === "lead" ? "Lead" : "Assigned"}
              </span>
              {taskCount > 0 && (
                <span className="text-[10px] text-zinc-600">
                  {taskCount} task{taskCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{agent.responsibilities}</p>
            {agent.skills?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {agent.skills.slice(0, 5).map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => openAgent(agent.slug)}
            className="shrink-0 text-xs text-amber-500 hover:text-amber-400"
          >
            View agent →
          </button>
        </article>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

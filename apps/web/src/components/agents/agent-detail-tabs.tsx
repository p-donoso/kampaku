"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DetailTabNav } from "@/components/panels/detail-tab-nav";
import { usePanels } from "@/components/panels/panel-provider";
import { collectAgentProjects } from "@/lib/agent-project-links";
import type { AgentDashboard, AgentMemory, AgentRecord } from "@/lib/types";

type Tab = "summary" | "projects" | "logs" | "learnings";

export function AgentDetailTabs({
  agent,
  dashboard,
  memories,
  counts,
  editing = false,
  systemPrompt,
  onSystemPromptChange,
}: {
  agent: AgentRecord;
  dashboard: AgentDashboard | null;
  memories: AgentMemory[];
  counts: { logs: number; learnings: number };
  editing?: boolean;
  systemPrompt?: string;
  onSystemPromptChange?: (value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const agentProjects = useMemo(() => collectAgentProjects(dashboard), [dashboard]);

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "summary", label: "Summary" },
    { id: "projects", label: "Projects", count: agentProjects.length || undefined },
    { id: "logs", label: "Log", count: counts.logs },
    { id: "learnings", label: "Learnings", count: counts.learnings },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DetailTabNav tabs={tabs} active={tab} onChange={setTab} ariaLabel="Agent memory" />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {tab === "summary" && (
            <Summary
              dashboard={dashboard}
              editing={editing}
              systemPrompt={systemPrompt ?? agent.systemPrompt}
              onSystemPromptChange={onSystemPromptChange}
            />
          )}
          {tab === "projects" && <ProjectsTab projects={agentProjects} />}
          {tab === "logs" && (
            <MemoryList
              items={memories.filter((item) => item.kind === "log")}
              empty="This agent has not saved any log entries yet."
            />
          )}
          {tab === "learnings" && (
            <MemoryList
              items={memories.filter((item) => item.kind === "learning")}
              empty="This agent has not consolidated any learnings yet."
            />
          )}
        </div>
      </div>
    </div>
  );
}

const detailTextareaClass =
  "w-full max-h-96 min-h-[12rem] resize-y overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-amber-500/50";

function Summary({
  dashboard,
  editing,
  systemPrompt,
  onSystemPromptChange,
}: {
  dashboard: AgentDashboard | null;
  editing: boolean;
  systemPrompt: string;
  onSystemPromptChange?: (value: string) => void;
}) {
  return (
    <>
      {dashboard && dashboard.total > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Assigned tasks</h2>
          <div className="space-y-2">
            {Object.entries(dashboard.byStatus).map(
              ([status, items]) =>
                items.length > 0 && (
                  <div key={status}>
                    <div className="text-xs font-medium uppercase text-zinc-500">{status}</div>
                    <ul className="mt-1 space-y-1">
                      {items.map((item) => (
                        <li key={item.id} className="text-sm text-zinc-300">
                          {item.title}
                          <span className="ml-2 text-[10px] text-zinc-600">{item.projectName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        </section>
      )}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">System prompt</h2>
        {editing ? (
          <textarea
            value={systemPrompt}
            onChange={(event) => onSystemPromptChange?.(event.target.value)}
            className={detailTextareaClass}
          />
        ) : (
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-400">
            {systemPrompt}
          </pre>
        )}
      </section>
    </>
  );
}

function ProjectsTab({ projects }: { projects: ReturnType<typeof collectAgentProjects> }) {
  const { openProject } = usePanels();

  if (!projects.length) {
    return <Empty>This agent has no tasks in any project.</Empty>;
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const byStatus = project.tasks.reduce<Record<string, number>>((acc, task) => {
          acc[task.status] = (acc[task.status] ?? 0) + 1;
          return acc;
        }, {});

        return (
          <article
            key={project.slug}
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-zinc-100">{project.name}</h3>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                    {project.slug}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {project.tasks.length} task{project.tasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(byStatus).map(([status, count]) => (
                    <span
                      key={status}
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
                    >
                      {status}: {count}
                    </span>
                  ))}
                </div>
                <ul className="mt-3 space-y-1">
                  {project.tasks.slice(0, 5).map((task) => (
                    <li key={task.id} className="text-xs text-zinc-400">
                      <span className="text-zinc-300">{task.title}</span>
                      <span className="ml-2 text-zinc-600">{task.status}</span>
                    </li>
                  ))}
                  {project.tasks.length > 5 && (
                    <li className="text-[10px] text-zinc-600">
                      +{project.tasks.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => openProject(project.slug)}
                className="shrink-0 text-xs text-amber-500 hover:text-amber-400"
              >
                View project →
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MemoryList({ items, empty }: { items: AgentMemory[]; empty: string }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-200">{item.title}</h2>
              {item.summary && <p className="mt-1 text-xs text-zinc-500">{item.summary}</p>}
            </div>
            <span title={`Relevance ${item.relevance} of 5`} className="shrink-0 text-xs text-amber-400">
              {"●".repeat(item.relevance)}
              <span className="text-zinc-700">{"●".repeat(5 - item.relevance)}</span>
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{item.body}</p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
            <time>
              {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(item.createdAt),
              )}
            </time>
            {item.projectId && <span>Project {item.projectId}</span>}
            {item.workItemId && <span>Task {item.workItemId}</span>}
            {item.conversationId && (
              <span title={item.conversationId}>Session {item.conversationId.slice(0, 8)}</span>
            )}
            <span>
              {item.accessCount === 1 ? "Recalled once" : `Recalled ${item.accessCount} times`}
            </span>
            {item.lastAccessedAt && (
              <span>
                Last accessed{" "}
                {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                  new Date(item.lastAccessedAt),
                )}
              </span>
            )}
          </div>
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

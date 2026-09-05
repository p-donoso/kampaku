"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentDetailTabs } from "@/components/agent-detail-tabs";
import { DetailPanelError, DetailPanelLoading } from "@/components/detail-panel-state";
import { useDetailPanel } from "@/components/detail-panel-context";
import { usePanels } from "@/components/panel-provider";
import { formatUserFacingError, isNotFoundError } from "@/lib/api-errors";
import { getAgent, getAgentDashboard, getAgentMemories, updateAgent } from "@/lib/api";
import type { AgentDashboard, AgentMemory, AgentRecord } from "@/lib/types";

type AgentDraft = {
  name: string;
  responsibilities: string;
  systemPrompt: string;
};

function toDraft(agent: AgentRecord): AgentDraft {
  return {
    name: agent.name,
    responsibilities: agent.responsibilities,
    systemPrompt: agent.systemPrompt,
  };
}

const detailTextareaClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50";

export function AgentDetailContent({ slug }: { slug: string }) {
  const { editing, registerHandlers } = useDetailPanel();
  const { close, onEntityNotFound } = usePanels();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [counts, setCounts] = useState({ logs: 0, learnings: 0 });
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return Promise.all([getAgent(slug), getAgentDashboard(slug), getAgentMemories(slug)]).then(
      ([agentData, dashboardData, memoryData]) => {
        setAgent(agentData);
        setDashboard(dashboardData);
        setMemories(memoryData.memories);
        setCounts(memoryData.counts);
        setDraft(toDraft(agentData));
        setError(null);
      },
    );
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAgent(null);
    setDraft(null);

    reload()
      .catch((e) => {
        if (cancelled) return;
        if (isNotFoundError(e)) {
          onEntityNotFound("agent", slug);
          return;
        }
        setError(formatUserFacingError(e, { entityType: "agent", action: "load" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload, slug, onEntityNotFound]);

  useEffect(() => {
    if (!agent || !draft) return;

    registerHandlers({
      canDelete: agent.source !== "builtin",
      deleteConfirmMessage: `Delete agent "${agent.name}"? This cannot be undone.`,
      onSave: async () => {
        const updated = await updateAgent(slug, {
          name: draft.name.trim(),
          responsibilities: draft.responsibilities,
          system_prompt: draft.systemPrompt,
        });
        setAgent(updated);
        setDraft(toDraft(updated));
      },
      onCancel: () => {
        setDraft(toDraft(agent));
      },
    });
  }, [agent, draft, registerHandlers, slug]);

  if (loading && !agent) {
    return <DetailPanelLoading label="Loading agent…" />;
  }

  if (error && !agent) {
    return (
      <DetailPanelError
        title="Could not load agent"
        message={error}
        actionLabel="Close"
        onAction={close}
      />
    );
  }

  if (!agent || !draft) return null;

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
              <span className="mb-1 block text-xs font-medium text-zinc-500">Responsibilities</span>
              <textarea
                value={draft.responsibilities}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, responsibilities: event.target.value })
                }
                rows={3}
                className={`${detailTextareaClass} resize-y`}
              />
            </label>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-400">{agent.responsibilities}</p>
            {agent.skills?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {agent.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      <AgentDetailTabs
        agent={agent}
        dashboard={dashboard}
        memories={memories}
        counts={counts}
        editing={editing}
        systemPrompt={editing ? draft.systemPrompt : agent.systemPrompt}
        onSystemPromptChange={(value) =>
          setDraft((prev) => prev && { ...prev, systemPrompt: value })
        }
      />
    </div>
  );
}

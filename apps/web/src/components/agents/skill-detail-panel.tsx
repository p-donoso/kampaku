"use client";

import { useCallback, useEffect, useState } from "react";
import { DetailPanelError, DetailPanelLoading } from "@/components/panels/detail-panel-state";
import { useDetailPanel } from "@/components/panels/detail-panel-context";
import { usePanels } from "@/components/panels/panel-provider";
import { formatUserFacingError, isNotFoundError } from "@/lib/api-errors";
import { getSkill, updateSkill } from "@/lib/api";
import type { SkillRecord } from "@/lib/types";

type SkillDraft = {
  name: string;
  description: string;
  capabilities: string;
  tools: string;
  promptFragment: string;
};

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDraft(skill: SkillRecord): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    capabilities: skill.capabilities.join(", "),
    tools: skill.tools.join(", "),
    promptFragment: skill.promptFragment,
  };
}

const fieldClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50";

export function SkillDetailContent({ slug }: { slug: string }) {
  const { editing, registerHandlers } = useDetailPanel();
  const { close, onEntityNotFound, openAgent, openSkill } = usePanels();
  const [skill, setSkill] = useState<SkillRecord | null>(null);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return getSkill(slug).then((data) => {
      setSkill(data);
      setDraft(toDraft(data));
      setError(null);
    });
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSkill(null);
    setDraft(null);

    reload()
      .catch((e) => {
        if (cancelled) return;
        if (isNotFoundError(e)) {
          onEntityNotFound("skill", slug);
          return;
        }
        setError(formatUserFacingError(e, { entityType: "skill", action: "load" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reload, slug, onEntityNotFound]);

  useEffect(() => {
    if (!skill || !draft) return;

    const assigned = skill.assignedAgentSlugs?.length ?? 0;
    registerHandlers({
      canDelete: assigned === 0,
      deleteConfirmMessage: assigned
        ? undefined
        : `Delete skill "${skill.name}"? This cannot be undone.`,
      onSave: async () => {
        const updated = await updateSkill(skill.slug, {
          name: draft.name.trim(),
          description: draft.description.trim(),
          capabilities: parseList(draft.capabilities),
          tools: parseList(draft.tools),
          prompt_fragment: draft.promptFragment.trim(),
        });
        setSkill(updated);
        setDraft(toDraft(updated));
        if (updated.slug !== slug) {
          openSkill(updated.slug);
        }
      },
      onCancel: () => {
        setDraft(toDraft(skill));
      },
    });
  }, [skill, draft, registerHandlers, slug, openSkill]);

  if (loading && !skill) {
    return <DetailPanelLoading label="Loading skill…" />;
  }

  if (error && !skill) {
    return (
      <DetailPanelError
        title="Could not load skill"
        message={error}
        actionLabel="Close"
        onAction={close}
      />
    );
  }

  if (!skill || !draft) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
      {editing ? (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Slug</span>
            <input readOnly value={skill.slug} className={`${fieldClass} text-zinc-500`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((prev) => prev && { ...prev, name: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Description</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => prev && { ...prev, description: event.target.value })
              }
              rows={2}
              className={`${fieldClass} resize-y`}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Capabilities</span>
              <input
                type="text"
                value={draft.capabilities}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, capabilities: event.target.value })
                }
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Tools</span>
              <input
                type="text"
                value={draft.tools}
                onChange={(event) =>
                  setDraft((prev) => prev && { ...prev, tools: event.target.value })
                }
                className={fieldClass}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Prompt fragment</span>
            <textarea
              value={draft.promptFragment}
              onChange={(event) =>
                setDraft((prev) => prev && { ...prev, promptFragment: event.target.value })
              }
              rows={8}
              className={`${fieldClass} resize-y font-mono`}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {skill.default && (
              <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400">
                Default — assigned to every agent
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-sm text-zinc-400">{skill.description}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-xs text-zinc-500">Capabilities</div>
              <div className="mt-1 text-sm text-zinc-200">
                {skill.capabilities.length ? skill.capabilities.join(", ") : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="text-xs text-zinc-500">Tools</div>
              <div className="mt-1 text-sm text-zinc-200">
                {skill.tools.length ? skill.tools.join(", ") : "—"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="text-xs text-zinc-500">Prompt fragment</div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-sm text-zinc-300">{skill.promptFragment}</pre>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="text-xs text-zinc-500">Assigned agents</div>
            {skill.assignedAgentSlugs?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {skill.assignedAgentSlugs.map((agentSlug) => (
                  <button
                    key={agentSlug}
                    type="button"
                    onClick={() => openAgent(agentSlug)}
                    className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-amber-500/40 hover:text-amber-400"
                  >
                    {agentSlug}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">No agents assigned</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

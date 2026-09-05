"use client";

import type { AgentTreeNode } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";
import { usePanels } from "@/components/panel-provider";

function SkillBadges({ skills }: { skills?: string[] }) {
  if (!skills?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {skills.slice(0, 4).map((skill) => (
        <span
          key={skill}
          className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400"
        >
          {skill}
        </span>
      ))}
      {skills.length > 4 && (
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
          +{skills.length - 4}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "archived" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
      }`}
    >
      {status === "active" ? "activo" : "archivado"}
    </span>
  );
}

function AgentNode({
  node,
  depth = 0,
  mode,
  onSelect,
}: {
  node: AgentTreeNode;
  depth?: number;
  mode: "link" | "panel";
  onSelect?: (slug: string) => void;
}) {
  const { agent, children } = node;
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = children.length > 0;

  const content = (
    <>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold text-zinc-400">
        {agent.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-zinc-100">{agent.name}</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            {agent.slug}
          </span>
          <StatusBadge status={agent.status} />
          {agent.source === "generated" && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
              generado
            </span>
          )}
          {agent.source === "bootstrap" && (
            <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">
              bootstrap
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{agent.responsibilities}</p>
        <SkillBadges skills={agent.skills} />
      </div>
    </>
  );

  return (
    <div className="relative">
      <div
        className="group flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-2.5 transition-colors hover:border-zinc-700"
        style={{ marginLeft: depth * 24 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${agent.name}`}
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
            >
              <path d="M7.2 4.8a1 1 0 0 1 1.4 0l4.5 4.5a1 1 0 0 1 0 1.4l-4.5 4.5a1 1 0 1 1-1.4-1.4l3.8-3.8-3.8-3.8a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden="true" />
        )}

        {mode === "link" ? (
          <Link href={`/agents/${agent.slug}`} className="flex min-w-0 flex-1 items-start gap-3">
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onSelect?.(agent.slug)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            {content}
          </button>
        )}

        {hasChildren && (
          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            {children.length} sub
          </span>
        )}

        {mode === "panel" && (
          <button
            type="button"
            onClick={() => onSelect?.(agent.slug)}
            className="shrink-0 self-center text-xs text-amber-500 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
          >
            Detalle →
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div className="relative mt-2 space-y-2">
          {children.map((child) => (
            <AgentNode key={child.agent.id} node={child} depth={depth + 1} mode={mode} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentTree({
  tree,
  mode = "link",
}: {
  tree: AgentTreeNode[];
  mode?: "link" | "panel";
}) {
  const { openAgent } = usePanels();
  const visibleTree = tree.flatMap((node) =>
    node.agent.slug === "kampaku" ? node.children : [node],
  );

  if (visibleTree.length === 0) {
    return <p className="text-sm text-zinc-500">No hay agentes registrados.</p>;
  }

  const handleSelect = mode === "panel" ? openAgent : undefined;

  return (
    <div className="space-y-3">
      {visibleTree.map((node) => (
        <AgentNode key={node.agent.id} node={node} mode={mode} onSelect={handleSelect} />
      ))}
    </div>
  );
}

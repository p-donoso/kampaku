"use client";

import { usePanels } from "@/components/panels/panel-provider";
import type { SkillSortKey } from "@/lib/skill-roster-utils";
import type { SkillRecord } from "@/lib/types";

function SortHeader({
  label,
  column,
  sortKey,
  sortDesc,
  onSort,
  className = "",
}: {
  label: string;
  column: SkillSortKey;
  sortKey: SkillSortKey;
  sortDesc: boolean;
  onSort: (key: SkillSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`text-left text-xs font-medium uppercase tracking-wide text-muted hover:text-secondary ${className}`}
    >
      {label}
      {active && <span className="ml-1 text-brand">{sortDesc ? "↓" : "↑"}</span>}
    </button>
  );
}

function highlightText(text: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q || !text.toLowerCase().includes(q)) return text;
  const idx = text.toLowerCase().indexOf(q);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-brand/20 text-brand">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function SkillsTable({
  rows,
  sortKey,
  sortDesc,
  searchQuery,
  onSort,
}: {
  rows: SkillRecord[];
  sortKey: SkillSortKey;
  sortDesc: boolean;
  searchQuery: string;
  onSort: (key: SkillSortKey) => void;
}) {
  const { openSkill, openAgent } = usePanels();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted">
        No skills match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            <th className="px-4 py-3 text-left">
              <SortHeader label="Skill" column="name" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="hidden px-3 py-3 lg:table-cell">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Capabilities</span>
            </th>
            <th className="hidden px-3 py-3 md:table-cell">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Tools</span>
            </th>
            <th className="px-3 py-3">
              <SortHeader label="Agents" column="agents" sortKey={sortKey} sortDesc={sortDesc} onSort={onSort} />
            </th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((skill) => {
            const agentCount = skill.assignedAgentSlugs?.length ?? 0;
            const borderClass =
              agentCount > 0 ? "border-l-violet-500" : "border-l-border";

            return (
              <tr
                key={skill.slug}
                className={`border-b border-border/80 border-l-2 ${borderClass} hover:bg-elevated/30`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openSkill(skill.slug)}
                    className="min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">
                        {highlightText(skill.name, searchQuery)}
                      </span>
                      {skill.default && (
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                          default
                        </span>
                      )}
                      {!skill.default && skill.slug.startsWith("system-") && (
                        <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                          system
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted">
                        {highlightText(skill.slug, searchQuery)}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                        {highlightText(skill.description, searchQuery)}
                      </p>
                    )}
                  </button>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {skill.capabilities.slice(0, 3).map((cap) => (
                      <span
                        key={cap}
                        className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                      >
                        {cap}
                      </span>
                    ))}
                    {skill.capabilities.length === 0 && (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {skill.tools.slice(0, 3).map((tool) => (
                      <span
                        key={tool}
                        className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                      >
                        {tool}
                      </span>
                    ))}
                    {skill.tools.length === 0 && (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {agentCount > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {skill.assignedAgentSlugs!.slice(0, 3).map((agentSlug) => (
                        <button
                          key={agentSlug}
                          type="button"
                          onClick={() => openAgent(agentSlug)}
                          className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/20"
                        >
                          {agentSlug}
                        </button>
                      ))}
                      {agentCount > 3 && (
                        <span className="text-[10px] text-muted">+{agentCount - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openSkill(skill.slug)}
                    className="text-xs text-brand hover:text-brand-gold"
                  >
                    Details →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

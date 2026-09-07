"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SkillsTable } from "@/components/agents/skills-table";
import { usePanels } from "@/components/panels/panel-provider";
import { listSkills } from "@/lib/api";
import {
  type SkillFilter,
  type SkillSortKey,
  computeSkillCounts,
  filterSkills,
  sortSkills,
} from "@/lib/skill-roster-utils";
import type { SkillRecord } from "@/lib/types";
import { useRosterSyncListener } from "@/lib/roster-sync";

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatPill({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: "violet" | "default";
  active?: boolean;
  onClick?: () => void;
}) {
  const accentClass = accent === "violet" ? "text-violet-400" : "text-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-brand/40 bg-brand/5" : "border-border bg-surface/40 hover:bg-elevated/40"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</div>
    </button>
  );
}

export function SkillCreateForm({ onCreated }: { onCreated: (slug: string) => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("code.agent");
  const [tools, setTools] = useState("code-agent");
  const [promptFragment, setPromptFragment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { createSkill } = await import("@/lib/api");
      const skill = await createSkill({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        capabilities: parseList(capabilities),
        tools: parseList(tools),
        prompt_fragment: promptFragment.trim(),
      });
      onCreated(skill.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create skill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface/30 p-4">
      <h2 className="text-sm font-medium text-foreground">New skill</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Slug
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9-]+"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="block text-xs text-muted">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Capabilities (comma-separated)
          <input
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="block text-xs text-muted">
          Tools (comma-separated)
          <input
            value={tools}
            onChange={(e) => setTools(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>
      <label className="block text-xs text-muted">
        Prompt fragment
        <textarea
          required
          value={promptFragment}
          onChange={(e) => setPromptFragment(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-background hover:bg-brand-gold disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create skill"}
      </button>
    </form>
  );
}

export function SkillsManagement({ initialSkills }: { initialSkills?: SkillRecord[] }) {
  const { openSkill } = usePanels();
  const [skills, setSkills] = useState<SkillRecord[]>(initialSkills ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialSkills);
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SkillSortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await listSkills();
      setSkills(res.skills ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useRosterSyncListener(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const counts = useMemo(() => computeSkillCounts(skills), [skills]);

  const rows = useMemo(() => {
    const filtered = filterSkills(skills, filter, search);
    return sortSkills(filtered, sortKey, sortDesc);
  }, [skills, filter, search, sortKey, sortDesc]);

  function handleSort(key: SkillSortKey) {
    if (sortKey === key) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(key === "agents");
    }
  }

  if (loading && skills.length === 0) {
    return <p className="text-sm text-muted">Loading skills…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatPill
          label="Total"
          value={counts.total}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatPill
          label="Assigned"
          value={counts.assigned}
          accent="violet"
          active={filter === "assigned"}
          onClick={() => setFilter(filter === "assigned" ? "all" : "assigned")}
        />
        <StatPill
          label="Unassigned"
          value={counts.unassigned}
          active={filter === "unassigned"}
          onClick={() => setFilter(filter === "unassigned" ? "all" : "unassigned")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm text-brand hover:border-brand/60"
        >
          {showCreate ? "Cancel" : "New skill"}
        </button>
      </div>

      {filter !== "all" && (
        <p className="text-xs text-muted">
          Filtering results ·{" "}
          <button type="button" onClick={() => setFilter("all")} className="text-brand hover:text-brand-gold">
            show all
          </button>
        </p>
      )}

      {showCreate && (
        <SkillCreateForm
          onCreated={(slug) => {
            setShowCreate(false);
            void refresh();
            openSkill(slug);
          }}
        />
      )}

      <SkillsTable
        rows={rows}
        sortKey={sortKey}
        sortDesc={sortDesc}
        searchQuery={search}
        onSort={handleSort}
      />
    </div>
  );
}

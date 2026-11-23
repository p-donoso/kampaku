"use client";

import SendRounded from "@mui/icons-material/SendRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useState } from "react";
import { createProject } from "@/lib/api";
import { formatUserFacingError } from "@/lib/api-errors";
import { notifyRosterSync } from "@/lib/roster-sync";
import type { ProjectRecord } from "@/lib/types";

/**
 * Opens a work order from the browser.
 *
 * Suite [16](../../../../../docs/eval/16-operator-ui.md) journey 5 — *"open a work order from the UI (create a
 * container) and confirm chat and CLI see it"* — could not be driven at all before this form: the projects page
 * rendered a roster, `CreateProjectForm` submitted an **intent** to the planner (a different object), and the only
 * surface that could create a container was chat, the CLI or REST. So the operator's own page could not do the one
 * thing intake is (BOARD F-133).
 *
 * Two deliberate details:
 *
 * - **The owner is a required field of the form.** A container without an accountable lead is not an acceptable
 *   intake outcome, and the route validates the slug before it persists anything, so a bad one leaves no orphan
 *   (BOARD F-005, F-036).
 * - **The repository path is the field, not a count.** It is stored as `file://<path>`, which is the form REST,
 *   `get_project`, the durable-state block and every other surface already carry (BOARD F-109) — the browser is
 *   not allowed to invent a fourth spelling.
 *
 * What the form does *not* do: it does not print a success sentence of its own. The reply is the container the
 * store returned, rendered from the response, so a create that was refused cannot read as one that worked.
 */
export function OpenWorkOrderForm({ onCreated }: { onCreated?: (project: ProjectRecord) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [leadSlug, setLeadSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ProjectRecord | null>(null);

  const canSubmit = name.trim().length > 0 && leadSlug.trim().length > 0 && !loading;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setCreated(null);
    try {
      const project = await createProject({
        name: name.trim(),
        slug: slug.trim() || undefined,
        repositories: repositoryPath.trim()
          ? [{ url: repositoryPath.trim(), role: "web" }]
          : undefined,
        project_lead_slug: leadSlug.trim(),
      });
      setCreated(project);
      setName("");
      setSlug("");
      setRepositoryPath("");
      notifyRosterSync({ action: "refresh" });
      onCreated?.(project);
    } catch (caught) {
      setError(formatUserFacingError(caught, { entityType: "project", action: "save" }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Open a work order"
      className="rounded-xl border border-border bg-surface/30 p-4"
    >
      <h3 className="text-sm font-medium text-foreground">Open a work order</h3>
      <p className="mt-1 text-xs text-muted">
        Creates a project container with an accountable lead. Chat, the CLI and the roster read the same record.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-secondary">
          Name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Text statistics CLI"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50"
          />
        </label>
        <label className="space-y-1 text-xs text-secondary">
          Slug
          <input
            type="text"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="textstats (optional — derived from the name)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50"
          />
        </label>
        <label className="space-y-1 text-xs text-secondary">
          Project lead slug
          <input
            type="text"
            value={leadSlug}
            onChange={(event) => setLeadSlug(event.target.value)}
            placeholder="textstats-lead"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50"
          />
        </label>
        <label className="space-y-1 text-xs text-secondary">
          Repository (absolute path or file:// url)
          <input
            type="text"
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.target.value)}
            placeholder="/home/you/projects/textstats"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50"
          />
        </label>
      </div>

      {error && (
        <Alert severity="error" className="mt-3">
          {error}
        </Alert>
      )}
      {created && (
        <p role="status" className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          Container <code className="font-mono">{created.slug}</code> opened as{" "}
          <code className="font-mono">{created.id}</code>
          {created.projectLeadAgentId ? " with its lead linked." : " — but no lead is linked."}
        </p>
      )}

      <Button
        type="submit"
        variant="contained"
        disabled={!canSubmit}
        loading={loading}
        endIcon={<SendRounded />}
        className="!mt-3"
      >
        {loading ? "Opening…" : "Open work order"}
      </Button>
    </form>
  );
}

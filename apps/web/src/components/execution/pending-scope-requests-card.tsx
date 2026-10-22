"use client";

import { useState } from "react";
import { decideScopeRequest, listScopeRequests, type ScopeRequest } from "@/lib/api/scope";

/**
 * The expansions a project has asked for, each with its own Approve / Reject.
 *
 * One button group per request, and no bulk control anywhere: approving an expansion is the one decision
 * in this product that must never be taken for a bundle. Suite 12 measured the alternative on run
 * `s12r1`, where the four asks arrived as one gate with five *combinations* and the operator could not
 * approve payments while leaving the mobile app parked.
 *
 * The paths come from the row, not from this component: what the request would touch was derived when it
 * was parked, from the project's own checkout, and re-deriving it here would be a second answer to the
 * same question.
 */
export function PendingScopeRequests({ initialRequests }: { initialRequests: ScopeRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [saving, setSaving] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(request: ScopeRequest, approve: boolean) {
    setSaving(request.id);
    setError(null);
    setOutcome(null);
    try {
      const result = await decideScopeRequest(request.id, { approve });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setOutcome(
        `${result.request.domain} on ${result.request.projectSlug} is ${result.request.status}. ` +
          "Any other request is untouched.",
      );
      // A fresh read, because a decision taken here is the decision every other surface must show: the
      // CLI's own `scope list` reads the same rows.
      const refreshed = await listScopeRequests({ projectSlug: request.projectSlug, status: "pending" });
      setRequests(refreshed.requests);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record the decision");
    } finally {
      setSaving(null);
    }
  }

  if (!requests.length) return <p className="text-sm text-muted">No pending scope requests.</p>;

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </p>
      )}
      {outcome && (
        <p role="status" className="rounded-lg bg-brand/10 px-3 py-2 text-xs text-brand">
          {outcome}
        </p>
      )}
      {requests.map((request) => (
        <article key={request.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">{request.domain}</span>
            <span className="text-muted">{request.projectSlug}</span>
            <span className="font-mono text-muted">{request.id}</span>
          </div>
          <p className="text-sm text-foreground">{request.summary}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {request.blastRadius.map((path) => (
              <li key={path} className="font-mono">
                {path}
              </li>
            ))}
          </ul>
          {request.cost && <p className="mt-2 text-[11px] text-muted">Cost: {request.cost}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving === request.id}
              onClick={() => void decide(request, true)}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              {saving === request.id ? "Saving…" : "Approve this expansion"}
            </button>
            <button
              type="button"
              disabled={saving === request.id}
              onClick={() => void decide(request, false)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary disabled:opacity-40"
            >
              Reject this expansion
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

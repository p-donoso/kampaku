import { fetchJson } from "./client";

/**
 * A scope expansion a project asked for, as the operator reads it.
 *
 * `blastRadius` is the point of the record: the paths the request would touch, derived from the project's
 * own checkout when it was parked, so the decision is made against a list rather than against a promise.
 * `cost` is stated in the product's counters (a plan preview and a job per leaf), never in currency.
 */
export interface ScopeRequest {
  id: string;
  projectSlug: string;
  request: string;
  domain: string;
  summary: string;
  blastRadius: string[];
  cost?: string;
  status: "pending" | "approved" | "rejected" | "refused";
  decision?: string;
  decidedAt?: string;
  requestedByAgentSlug?: string;
  createdAt: string;
}

export function listScopeRequests(filter?: {
  projectSlug?: string;
  status?: ScopeRequest["status"];
}): Promise<{ requests: ScopeRequest[]; pending: number; total: number }> {
  const params = new URLSearchParams();
  if (filter?.projectSlug) params.set("project", filter.projectSlug);
  if (filter?.status) params.set("status", filter.status);
  const query = params.toString();
  return fetchJson(`/api/v1/scope-requests${query ? `?${query}` : ""}`);
}

/**
 * Answers **one** request.
 *
 * `approve` is required and boolean: there is no "accept all" and no bulk path, because approving an
 * expansion is the one decision in the product that must never be taken for a bundle. The sentence the
 * platform returns names what the decision did and says the other requests are untouched.
 */
export function decideScopeRequest(
  id: string,
  input: { approve: boolean; decision?: string },
): Promise<{ request: ScopeRequest }> {
  return fetchJson(`/api/v1/scope-requests/${encodeURIComponent(id)}/decide`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

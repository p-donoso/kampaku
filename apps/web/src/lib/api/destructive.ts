import { toApiError } from "../api-errors";
import { getBaseUrl } from "./client";

/**
 * The browser half of the destructive-action gate.
 *
 * The Core routes refuse to delete a project or an agent on one request: the first one has **no effect** and
 * answers `202` with a `consequence` in words plus a `reference` and `confirmationToken` bound to the exact
 * action, target and payload (BOARD F-042). The web delete button used to fire one `DELETE` and treat any
 * 2xx as success, so once the gate landed it would have closed the panel and marked the entity deleted
 * while nothing had happened — the same "signal satisfied, meaning absent" shape the gate exists to remove.
 *
 * **The operator is asked with the server's own consequence, not a generic sentence** (BOARD F-043). The
 * wording the operator approves is the wording the server recorded, which is what the
 * [security model](../../../../docs/security/security-model.md) means by a gate that *"states the
 * consequence"*: a generic "this cannot be undone" is a click, not a gate.
 */

export interface DestructiveActionChallenge {
  status: "confirmation_required";
  action: string;
  target: string;
  consequence: string;
  reference: string;
  confirmationToken: string;
}

export interface DestructiveActionConfirmation {
  reference: string;
  confirmationToken: string;
  confirmedBy?: string;
}

/** The shape `toApiError` accepts, so a caller cannot pass a label it would drop. */
export interface DestructiveErrorContext {
  entityType: "agent" | "project" | "skill" | "task";
  action: "load" | "save" | "delete";
}

/**
 * The human gate. Returns `true` when the operator approves **the consequence it was handed**.
 *
 * Required rather than optional on purpose: a client that does not ask cannot be trusted to confirm, and an
 * optional callback would make "confirm without asking" the quiet default.
 */
export type DestructiveConfirmer = (consequence: string) => boolean;

/**
 * First step: performs the request with no confirmation.
 *
 * Returns the challenge when the server gated it, and `undefined` when it acted (a 204, which the current
 * routes never answer on the first request but must stay correct if an operation is not gated).
 */
export async function requestDestructiveDelete(
  path: string,
  context: DestructiveErrorContext,
): Promise<DestructiveActionChallenge | undefined> {
  const res = await fetch(`${getBaseUrl()}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw toApiError(path, res.status, body, context);
  }
  if (res.status === 202) {
    return (await res.json()) as DestructiveActionChallenge;
  }
  return undefined;
}

/** Second step: presents the confirmation the first step returned. */
export async function confirmDestructiveDelete(
  path: string,
  confirmation: DestructiveActionConfirmation,
  context: DestructiveErrorContext,
): Promise<void> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmation_reference: confirmation.reference,
      confirmation_token: confirmation.confirmationToken,
      confirmed_by: confirmation.confirmedBy ?? "web",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw toApiError(path, res.status, body, context);
  }
}

/**
 * Both steps, in the order that keeps the operator's answer meaningful: prepare, ask with the recorded
 * consequence, and only then perform it.
 *
 * A declined confirmation leaves the request recorded and the entity untouched, which is the correct
 * outcome — the operator was asked and said no.
 */
export async function deleteThroughGate(
  path: string,
  context: DestructiveErrorContext,
  confirm: DestructiveConfirmer,
): Promise<void> {
  const challenge = await requestDestructiveDelete(path, context);
  if (!challenge) return;
  if (!confirm(challenge.consequence)) return;
  await confirmDestructiveDelete(path, challenge, context);
}

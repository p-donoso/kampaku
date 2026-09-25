import { toApiError } from "../api-errors";
import { getBaseUrl } from "./client";

/**
 * The browser half of the destructive-action gate.
 *
 * The Core routes now refuse to delete a project or an agent on one request: the first one has **no
 * effect** and answers `202` with a `consequence` in words plus a `reference` and `confirmationToken`
 * (BOARD F-042). The web delete button used to fire one `DELETE` and treat any 2xx as success, so once the
 * gate landed it would have closed the panel and marked the entity deleted while nothing had happened —
 * the same "signal satisfied, meaning absent" shape the gate exists to remove.
 *
 * These two calls are that two-step, so the UI stays honest: request the challenge, then present it.
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

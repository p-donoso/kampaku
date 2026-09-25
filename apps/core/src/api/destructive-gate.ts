import { createHash } from "node:crypto";
import type { Store } from "../persistence/store.js";

/**
 * The gate the destructive routes were missing.
 *
 * Measured 2026-09-24 in the suite-04 run: three destructive requests went through REST with **no
 * actor and no confirmation**, and all three succeeded —
 *
 * | Request | Result |
 * |---|---|
 * | `DELETE /api/v1/agents/<lead>` | **204**, the agent was gone |
 * | `DELETE /api/v1/projects/<slug>` | **204**, the project was gone |
 * | `PATCH /api/v1/projects/<slug>` reassigning the lead and rewriting `repositories` to `file:///tmp/evil` | **200**, and it created `/tmp/evil`, ran `git init` and seeded six files |
 *
 * The [security model](../../../../docs/security/security-model.md) decides this tier rather than
 * leaving it open: deleting an agent or a project is **gated** — *"a named, recorded approval that
 * states the consequence. One unconfirmed turn is never enough"* — and *"a prohibition that lives only
 * in a prompt is not a prohibition"*, so the gate belongs in runtime code.
 *
 * The mechanism lives in the store (`recordDestructiveRequest` / `confirmDestructiveAction` /
 * `consumeDestructiveAction`). This module is the one place the routes call it, so an operator surface
 * and a direct REST attempt cannot drift apart the way the agent path and REST already did.
 *
 * The contract is two requests:
 *
 * 1. no confirmation → **202** with `reference`, `confirmationToken`, the `consequence` in words, and the
 *    action and target. The call has **no effect**. The token is bound to the exact payload, so a
 *    confirmation cannot be replayed against a different action, target or payload, and it is single-use.
 * 2. the same request with `confirmation_reference` / `confirmation_token` → the action runs once.
 */

export interface DestructiveActionDescriptor {
  /** Stable action id, e.g. `project.delete`. Part of the token commitment. */
  action: string;
  /** The exact target, resolved to its canonical form (a slug, not whichever spelling was in the URL). */
  target: string;
  /** The consequence, in words an operator can read, stated on the first response and recorded. */
  consequence: string;
  /** The exact payload the confirmation is bound to. */
  payload: Record<string, unknown>;
}

export interface DestructiveConfirmationInput {
  reference?: string;
  confirmationToken?: string;
  confirmedBy?: string;
}

export interface DestructiveChallenge {
  status: "confirmation_required";
  action: string;
  target: string;
  consequence: string;
  reference: string;
  confirmationToken: string;
}

export interface DestructiveRefusal {
  error: string;
  code: "CONFIRMATION_MISMATCH";
}

/** Minimal shape of the parts of a Hono request the gate reads. Keeps this module free of route types. */
export interface ConfirmationRequest {
  query: (key: string) => string | undefined;
  json: <T = unknown>() => Promise<T>;
}

/**
 * Canonical hash of a payload, so two spellings of one request hash the same.
 *
 * Object key order is normalised recursively: `{a, b}` and `{b, a}` are one payload, while a changed
 * value — a different repository URL, a lead reassignment — is a different one.
 */
export function destructivePayloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

/** Reads a JSON body if there is one. A `DELETE` with no body is the ordinary case, not an error. */
export async function readOptionalJsonBody(
  request: ConfirmationRequest,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The confirmation, from the body or the query string.
 *
 * Query string as well as body so a `DELETE` needs no body — `curl -X DELETE "...?confirmation_token=…"`
 * is the whole of it — while the same fields in a `PATCH` body work unchanged.
 */
export function readDestructiveConfirmation(
  request: ConfirmationRequest,
  body: Record<string, unknown> = {},
): DestructiveConfirmationInput {
  const pick = (snake: string, camel: string): string | undefined => {
    const fromBody = body[snake] ?? body[camel];
    if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
    const fromQuery = request.query(snake) ?? request.query(camel);
    return fromQuery?.trim() || undefined;
  };

  return {
    reference: pick("confirmation_reference", "confirmationReference"),
    confirmationToken: pick("confirmation_token", "confirmationToken"),
    confirmedBy: pick("confirmed_by", "confirmedBy"),
  };
}

export type DestructiveGateResult =
  | { proceed: true }
  | { proceed: false; status: 202; body: DestructiveChallenge }
  | { proceed: false; status: 403; body: DestructiveRefusal };

export function gateDestructiveAction(
  store: Store,
  action: DestructiveActionDescriptor,
  confirmation: DestructiveConfirmationInput,
): DestructiveGateResult {
  const payloadHash = destructivePayloadHash(action.payload);

  if (confirmation.reference && confirmation.confirmationToken) {
    const confirmed = store.confirmDestructiveAction({
      reference: confirmation.reference,
      confirmationToken: confirmation.confirmationToken,
      action: action.action,
      target: action.target,
      payloadHash,
    });
    if (!confirmed) {
      return {
        proceed: false,
        status: 403,
        body: {
          error:
            "The confirmation did not match this request: the action, target or payload differs from the " +
            "one that was requested, or the confirmation has already been used.",
          code: "CONFIRMATION_MISMATCH",
        },
      };
    }
    // Consumed before the action runs, so a failure later cannot leave a live confirmation behind.
    store.consumeDestructiveAction(confirmation.reference, confirmation.confirmedBy ?? "operator");
    return { proceed: true };
  }

  const { reference, confirmationToken } = store.recordDestructiveRequest({
    action: action.action,
    target: action.target,
    payloadHash,
    consequence: action.consequence,
  });

  return {
    proceed: false,
    status: 202,
    body: {
      status: "confirmation_required",
      action: action.action,
      target: action.target,
      consequence: action.consequence,
      reference,
      confirmationToken,
    },
  };
}

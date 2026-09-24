import type { Hono } from "hono";
import type { AgentStore } from "../persistence/agent-store.js";
import type { RefusalStore } from "../persistence/refusal-store.js";

/**
 * Register HTTP REST endpoints for out-of-scope refusals.
 *
 * A refusal is a decision the factory made on the operator's behalf, so it is readable on every
 * surface for the same reason a question is: a decision the operator cannot see is not a decision they
 * can review. Exposing it here — next to the CLI command — is what keeps the refusal from becoming a
 * CLI-only or chat-only behaviour, the shape recorded as
 * [BOARD F-010](../../../../docs/eval/results/BOARD.md).
 *
 * Deliberately read-only. A refusal cannot be edited or deleted: it is a record of what the factory
 * declined and why, and rewriting it would defeat the point of recording it.
 */
export function registerRefusalRoutes(
  app: Hono,
  refusalStore: RefusalStore,
  agentStore: AgentStore,
): void {
  app.get("/api/v1/refusals", (c) => {
    const boundary = c.req.query("boundary");
    const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));

    const refusals = refusalStore
      .list()
      .filter((refusal) => !boundary || refusal.boundary === boundary)
      .map((refusal) => ({
        ...refusal,
        refusedByAgentSlug: refusal.refusedByAgentId
          ? slugById.get(refusal.refusedByAgentId) ?? refusal.refusedByAgentId
          : undefined,
      }));

    return c.json({
      refusals,
      // The count is reported because "how often does the factory refuse, and for which boundary" is a
      // product fact, not an anecdote.
      total: refusals.length,
    });
  });

  app.get("/api/v1/refusals/:id", (c) => {
    const refusal = refusalStore.get(c.req.param("id"));
    if (!refusal) return c.json({ error: "Refusal not found." }, 404);
    return c.json({ refusal });
  });
}

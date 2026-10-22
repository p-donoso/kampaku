import type { Hono } from "hono";
import type { AgentStore } from "../persistence/agent-store.js";
import type { ScopeRequestStore } from "../persistence/scope-request-store.js";
import type { ScopeRequestStatus } from "../persistence/scope-request-store.js";

/**
 * Scope expansions on the operator's REST surface: read them, and decide **one** at a time.
 *
 * Three surfaces answer one list (suite 12's U3, and the parity rule suite 02 locked): `GET
 * /api/v1/scope-requests` is what the web dashboard renders and what `kampaku scope list` prints, and
 * `POST /api/v1/scope-requests/:id/decide` is what the web button and `kampaku scope approve` call. A
 * decision taken on one surface is therefore the decision the others read, because there is one store
 * and one route behind all of them.
 *
 * Deliberately has **no create route**: an expansion is parked by the seat that received it, through
 * `request_scope_expansion`, so the request carries the asker, the conversation and the price. A create
 * route on the REST surface would let an operator ask the factory to approve itself.
 */
export function registerScopeRequestRoutes(
  app: Hono,
  scopeRequestStore: ScopeRequestStore,
  agentStore: AgentStore,
): void {
  app.get("/api/v1/scope-requests", (c) => {
    const projectSlug = c.req.query("project");
    const status = c.req.query("status") as ScopeRequestStatus | undefined;
    const slugById = new Map(agentStore.listAllAgents().map((agent) => [agent.id, agent.slug]));

    const requests = scopeRequestStore.list({ projectSlug, status }).map((request) => ({
      ...request,
      requestedByAgentSlug: request.requestedByAgentId
        ? slugById.get(request.requestedByAgentId) ?? request.requestedByAgentId
        : undefined,
    }));

    return c.json({
      requests,
      // The pending count is reported beside the list because it is the number the operator acts on: an
      // unanswered expansion holds no work, so nothing else in the product would count it.
      pending: requests.filter((request) => request.status === "pending").length,
      total: requests.length,
    });
  });

  app.get("/api/v1/scope-requests/:id", (c) => {
    const request = scopeRequestStore.get(c.req.param("id"));
    if (!request) return c.json({ error: "Scope request not found." }, 404);
    return c.json({ request });
  });

  app.post("/api/v1/scope-requests/:id/decide", async (c) => {
    const id = c.req.param("id");
    let body: { approve?: unknown; decision?: unknown };
    try {
      body = (await c.req.json()) as { approve?: unknown; decision?: unknown };
    } catch {
      return c.json({ error: "A JSON body with \"approve\" is required." }, 400);
    }
    if (typeof body.approve !== "boolean") {
      return c.json(
        {
          error:
            "A decision must say whether this request is approved (approve: true) or rejected (approve: false). " +
            "One request is one decision; approving it does not authorize any other.",
        },
        400,
      );
    }
    if (body.decision !== undefined && typeof body.decision !== "string") {
      return c.json({ error: "\"decision\" must be the operator's words." }, 400);
    }

    try {
      const decided = scopeRequestStore.decide(id, {
        approve: body.approve,
        decision: body.decision,
      });
      return c.json({ request: decided });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record the decision.";
      const code = (error as { code?: string }).code;
      if (code === "NOT_FOUND") return c.json({ error: message }, 404);
      if (code === "CONFLICT") return c.json({ error: message }, 409);
      return c.json({ error: message }, 400);
    }
  });
}

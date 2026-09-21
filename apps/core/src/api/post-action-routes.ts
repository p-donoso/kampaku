/**
 * @module api/post-action-routes
 * HTTP surface for post-action reviews and their per-projection retries.
 */
import type { Hono } from "hono";
import type { AgentStore } from "../persistence/agent-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { MemoryStore } from "../persistence/memory-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { PostActionReviewStore } from "../persistence/post-action-store.js";
import type { Store } from "../persistence/store.js";
import type { WikiStore } from "../persistence/wiki-store.js";
import {
  evaluatePostActionClosure,
  retryPostActionProjection,
  type PostActionRuntime,
  isPostActionProjectionName,
} from "../application/pm/post-action/index.js";

export interface PostActionRoutesContext {
  pmStore: PmStore;
  agentStore: AgentStore;
  reviewStore?: PostActionReviewStore;
  store?: Store;
  journalStore?: JournalStore;
  memoryStore?: MemoryStore;
  wikiStore?: WikiStore;
}

export function registerPostActionRoutes(app: Hono, context: PostActionRoutesContext): void {
  const runtime = (): PostActionRuntime | undefined => {
    if (!context.reviewStore) return undefined;
    return {
      pmStore: context.pmStore,
      agentStore: context.agentStore,
      reviewStore: context.reviewStore,
      store: context.store,
      journalStore: context.journalStore,
      memoryStore: context.memoryStore,
      wikiStore: context.wikiStore,
    };
  };

  app.get("/api/v1/projects/:projectId/post-action-reviews", (c) => {
    const store = context.reviewStore;
    if (!store) return c.json({ reviews: [] });
    const limit = Number(c.req.query("limit") ?? "20");
    return c.json({ reviews: store.listByProject(c.req.param("projectId"), Number.isFinite(limit) ? limit : 20) });
  });

  app.get("/api/v1/post-action-reviews/:reviewId", (c) => {
    const store = context.reviewStore;
    if (!store) return c.body(null, 404);
    const review = store.getById(c.req.param("reviewId"));
    if (!review) return c.body(null, 404);
    return c.json(review);
  });

  app.post("/api/v1/post-action-reviews/:reviewId/retry", async (c) => {
    const active = runtime();
    if (!active) return c.body(null, 404);
    const body = await c.req.json<{ projection?: string }>();
    if (!isPostActionProjectionName(body.projection)) {
      return c.json({ error: "projection must be journal, memory, or wiki", code: "VALIDATION" }, 400);
    }
    try {
      return c.json(retryPostActionProjection(active, c.req.param("reviewId"), body.projection));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : String(error), code: "NOT_FOUND" },
        404,
      );
    }
  });

  app.get("/api/v1/projects/:projectId/post-action-closure", (c) => {
    const active = runtime();
    if (!active) return c.json({ error: "Post-action reviews are not available.", code: "UNAVAILABLE" }, 503);
    const agentSlug = c.req.query("agent_slug") ?? "kampaku";
    return c.json(
      evaluatePostActionClosure(active, {
        projectId: c.req.param("projectId"),
        agentSlug,
        wikiSyncRequired: context.store?.getProject(c.req.param("projectId"))?.wikiSyncRequired === true,
      }),
    );
  });
}

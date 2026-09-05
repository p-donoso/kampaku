import { Hono } from "hono";
import {
  listProjectJournal,
  listWorkItemJournal,
  parseJournalKinds,
} from "../application/pm/journal.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { Store } from "../persistence/store.js";

export function registerJournalRoutes(
  app: Hono,
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  journalStore: JournalStore,
) {
  app.get("/api/v1/projects/:projectId/journal", (c) => {
    const projectId = c.req.param("projectId");
    const project = store.getProject(projectId) ?? store.getProjectBySlug(projectId);
    if (!project) return c.body(null, 404);

    const kinds = parseJournalKinds(c.req.query("kinds"));
    const limit = Number(c.req.query("limit") ?? "100");
    const before = c.req.query("before") ?? undefined;
    const workItemId = c.req.query("workItemId") ?? undefined;

    const entries = listProjectJournal(journalStore, pmStore, agentStore, project.id, {
      workItemId,
      kinds,
      limit: Number.isFinite(limit) ? limit : 100,
      before,
    });

    return c.json({ entries });
  });

  app.get("/api/v1/work-items/:id/journal", (c) => {
    const workItemId = c.req.param("id");
    const workItem = pmStore.getWorkItem(workItemId);
    if (!workItem) return c.body(null, 404);

    const kinds = parseJournalKinds(c.req.query("kinds"));
    const limit = Number(c.req.query("limit") ?? "100");
    const before = c.req.query("before") ?? undefined;

    const entries = listWorkItemJournal(journalStore, pmStore, agentStore, workItemId, {
      kinds,
      limit: Number.isFinite(limit) ? limit : 100,
      before,
    });

    return c.json({ entries });
  });
}

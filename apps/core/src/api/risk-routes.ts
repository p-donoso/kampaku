import type { Hono } from "hono";
import {
  RiskError,
  disposeRisk,
  getProjectRisk,
  listProjectRisks,
  type RiskAction,
} from "../application/pm/risk-register.js";
import type { AgentStore } from "../persistence/agent-store.js";
import type { JournalStore } from "../persistence/journal-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { Store } from "../persistence/store.js";

/**
 * The operator's risk surface.
 *
 * Measured 2026-10-01 on suite 08 run `s08r7` (BOARD F-084): `POST /api/v1/projects/textstats/play`
 * answered `open_high_risk` and queued nothing, while `GET /api/v1/projects/textstats/risks` and
 * `GET /api/v1/risks` were both **404** and the only holder of `update_risk` was an agent. A gate the
 * operator is stopped by has to be a gate the operator can read and answer, on the surface that stopped
 * them.
 *
 * Four routes, and the split matters:
 *
 * | route | what it answers |
 * |---|---|
 * | `GET /api/v1/risks` | every risk on the instance, with its project slug |
 * | `GET /api/v1/projects/:idOrSlug/risks` | every risk of one project — the read `play`'s gate is about |
 * | `GET /api/v1/risks/:riskId` | one risk, by the id the gate's sentence now carries |
 * | `POST /api/v1/risks/:riskId/disposition` | mitigate, accept, or escalate it, with an outcome |
 *
 * The disposition is a journal entry, not a status column: `GET /api/v1/projects/:idOrSlug/journal?kinds=risk_reported,risk_updated`
 * shows the same write, and the execution gate counts the same entries.
 */
export function registerRiskRoutes(
  app: Hono,
  store: Store,
  pmStore: PmStore,
  agentStore: AgentStore,
  journalStore: JournalStore,
): void {
  app.get("/api/v1/risks", (c) => {
    const projectFilter = c.req.query("project") ?? c.req.query("projectId");
    const projects = projectFilter
      ? [store.getProject(projectFilter) ?? store.getProjectBySlug(projectFilter)].filter(
          (project) => project !== undefined,
        )
      : store.listProjects();

    const risks = projects.flatMap((project) =>
      listProjectRisks(journalStore, pmStore, agentStore, project.id).map((risk) => ({
        ...risk,
        projectSlug: project.slug,
      })),
    );

    return c.json({ risks });
  });

  app.get("/api/v1/projects/:idOrSlug/risks", (c) => {
    const project = store.getProjectByIdOrSlug(c.req.param("idOrSlug"));
    if (!project) return c.body(null, 404);
    const risks = listProjectRisks(journalStore, pmStore, agentStore, project.id).map((risk) => ({
      ...risk,
      projectSlug: project.slug,
    }));
    return c.json({ risks, blockers: risks.filter((risk) => risk.blocksExecution).length });
  });

  app.get("/api/v1/risks/:riskId", (c) => {
    const risk = getProjectRisk(journalStore, pmStore, agentStore, c.req.param("riskId"));
    if (!risk) return c.body(null, 404);
    const project = store.getProject(risk.projectId);
    return c.json({ risk: { ...risk, projectSlug: project?.slug } });
  });

  app.post("/api/v1/risks/:riskId/disposition", async (c) => {
    const body = await c.req.json<{
      action?: RiskAction;
      outcome?: string;
      accepted_by?: string;
      by_agent_id?: string;
    }>();
    try {
      const risk = getProjectRisk(journalStore, pmStore, agentStore, c.req.param("riskId"));
      if (!risk) return c.body(null, 404);
      const result = disposeRisk(journalStore, pmStore, {
        riskId: risk.id,
        action: body.action as RiskAction,
        outcome: body.outcome ?? "",
        // An operator-written disposition has no agent id: the emperor answered this gate in person, and
        // recording an agent that did not act would be the same defect as the gate that named no risk.
        agentId: body.by_agent_id,
        acceptedBy: body.accepted_by,
      });
      const updated = getProjectRisk(journalStore, pmStore, agentStore, risk.id);
      return c.json({ disposition: result, risk: updated }, 201);
    } catch (error) {
      if (error instanceof RiskError) {
        return c.json({ error: error.message, code: error.code }, error.code === "NOT_FOUND" ? 404 : 400);
      }
      throw error;
    }
  });
}

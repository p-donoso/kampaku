import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "../../src/api/app.js";
import { executeReportRisk, executeUpdateRisk } from "../../src/agents/runtime/tools/risks.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore, seedSkillsFromCatalog } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * The lock for **BOARD F-084 — the risk gate the operator cannot read**.
 *
 * The measurement that opened the row, 2026-10-01 on suite 08 run `s08r7`:
 *
 * ```json
 * POST /api/v1/projects/textstats/play →
 * {"autoExecute":true,"gated":true,"gate":{"gated":true,"reason":"open_high_risk",
 *  "detail":"1 high or critical risk(s) require disposition"}}
 * ```
 *
 * and nothing queued. `kampaku --help` had no `risks` command, `GET /api/v1/projects/<slug>/risks` and
 * `GET /api/v1/risks` were **404**, and the only writer of a risk was an agent tool — so the gate's own
 * sentence named nothing an operator could read or answer.
 *
 * Four clauses, and each one is a way the fix could be false:
 *
 * 1. **The gate names the risk.** A count is not a handle: without the id and a title, the operator still
 *    has to ask somebody else which risk stopped the line. The risk is reported here through the **agent
 *    tool**, because that is the writer that produced the specimen.
 * 2. **The operator reads it on a route.** The same id, the same title, the same fields, on
 *    `/api/v1/projects/:slug/risks`, `/api/v1/risks?project=` and `/api/v1/risks/:id` — surface
 *    agreement, which is suite 02's rule.
 * 3. **The operator discharges it, and `play` moves.** An acceptance names who accepted the exposure and
 *    leaves that name in the journal entry's own body; after it, `play` no longer stops on
 *    `open_high_risk` and starts the next leaf.
 * 4. **The empty dispositions are refused.** A gate that clears on the word "mitigated" is a status field,
 *    not a gate, so an outcome is required and an acceptance names an actor (defaulting to `operator`,
 *    the emperor answering in person, rather than to nothing).
 */
describe("eval 04/14 — the operator read and discharge of a blocking risk", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  function fixture() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-operator-risk-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    const memoryStore = new MemoryStore(db);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    bootstrapProject(store, config, db);
    seedSkillsFromCatalog(skillStore, resolve(process.cwd(), "../.."));
    mkdirSync(config.workspaceRoot, { recursive: true });
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      undefined,
      memoryStore,
      undefined,
      journalStore,
      wikiStore,
      db,
    );
    const toolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      memoryStore,
      journalStore,
      wikiStore,
      config,
    } as unknown as KampakuToolContext;
    return { app, store, pmStore, agentStore, journalStore, skillStore, config, toolContext };
  }

  /** A project with a lead and one unstarted leaf, opened the way the product documents it. */
  async function openProject(f: ReturnType<typeof fixture>, slug: string) {
    const lead = await f.app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: `${slug}-lead`,
        name: `${slug} lead`,
        responsibilities: `Own the ${slug} work order`,
        parent_slug: "kampaku",
      }),
    });
    expect(lead.status, "a lead can be created").toBe(201);
    const leadSlug = ((await lead.json()) as { agent: { slug: string } }).agent.slug;

    const created = await f.app.request("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, name: slug, project_lead_slug: leadSlug }),
    });
    expect(created.status, "a work order opens with its lead").toBeLessThan(300);
    const projectId = ((await created.json()) as { id: string }).id;

    const leafId = uuidv4();
    const now = new Date().toISOString();
    f.pmStore.createWorkItem({
      id: leafId,
      projectId,
      title: "Implement the slice",
      status: "todo",
      priority: 0,
      sortOrder: 0,
      acceptanceCriteria: ["the slice runs"],
      dependsOn: [],
      createdAt: now,
      updatedAt: now,
    });

    return { projectId, leadSlug, leafId };
  }

  /** The risk that stopped `play` on `s08r7`, recorded the way the lead recorded it. */
  function reportBlockingRisk(
    f: ReturnType<typeof fixture>,
    projectId: string,
    leadSlug: string,
    leafId: string,
    title = "Phase-1 verification and audit are self-performed: no independent agent under riskdemo",
  ) {
    return executeReportRisk(f.toolContext, {
      agent_slug: leadSlug,
      project_id: projectId,
      work_item_id: leafId,
      title,
      description: "All leaves were remapped to one seat, so the phase gate would be self-signed.",
      probability: "high",
      impact: "high",
      mitigation: "Provision an independent verifier, or accept self-verification in writing.",
      review_at: "the phase-1 audit leaf, before the phase container is closed",
    });
  }

  it("gates play on the open high risk and names it, instead of counting it", async () => {
    const f = fixture();
    const { projectId, leadSlug, leafId } = await openProject(f, "riskdemo");
    const reported = reportBlockingRisk(f, projectId, leadSlug, leafId);

    const played = await f.app.request("/api/v1/projects/riskdemo/play", { method: "POST" });
    expect(played.status).toBe(202);
    const body = (await played.json()) as {
      gated?: boolean;
      gate?: { reason?: string; detail?: string };
      nextWorkItemId?: string | null;
    };

    expect(body.gated).toBe(true);
    expect(body.gate?.reason).toBe("open_high_risk");
    expect(body.gate?.detail, "the gate names the risk's id").toContain(reported.riskId);
    expect(body.gate?.detail, "the gate names the risk's title").toContain("Phase-1 verification");
    expect(body.gate?.detail, "and it still says how many").toMatch(/^1 high or critical risk/);
    expect(body.nextWorkItemId ?? null, "a gated play queues nothing").toBeNull();
  });

  it("lets the operator read the risk on every route, with the same id and fields", async () => {
    const f = fixture();
    const { projectId, leadSlug, leafId } = await openProject(f, "riskdemo");
    const reported = reportBlockingRisk(f, projectId, leadSlug, leafId);

    const byProject = await f.app.request("/api/v1/projects/riskdemo/risks");
    expect(byProject.status).toBe(200);
    const projectBody = (await byProject.json()) as {
      risks: Array<Record<string, unknown>>;
      blockers: number;
    };
    const risk = projectBody.risks[0]!;
    expect(projectBody.risks).toHaveLength(1);
    expect(projectBody.blockers).toBe(1);
    expect(risk.id).toBe(reported.riskId);
    expect(risk.title).toBe(
      "Phase-1 verification and audit are self-performed: no independent agent under riskdemo",
    );
    expect(risk.description).toContain("self-signed");
    expect(risk.probability).toBe("high");
    expect(risk.impact).toBe("high");
    expect(risk.mitigation).toContain("independent verifier");
    expect(risk.reviewAt).toContain("phase-1 audit leaf");
    expect(risk.status).toBe("open");
    expect(risk.blocksExecution).toBe(true);
    expect(risk.reportedByAgentSlug).toBe(leadSlug);

    const byInstance = await f.app.request("/api/v1/risks?project=riskdemo");
    expect(byInstance.status).toBe(200);
    const instanceRisks = ((await byInstance.json()) as { risks: Array<Record<string, unknown>> }).risks;
    expect(instanceRisks[0]!.id).toBe(reported.riskId);
    expect(instanceRisks[0]!.projectSlug).toBe("riskdemo");

    const byId = await f.app.request(`/api/v1/risks/${reported.riskId}`);
    expect(byId.status).toBe(200);
    expect(((await byId.json()) as { risk: { id: string } }).risk.id).toBe(reported.riskId);

    const unknown = await f.app.request("/api/v1/risks/no-such-risk");
    expect(unknown.status, "an id nothing recorded is a 404, not an empty risk").toBe(404);
  });

  it("discharges the risk with an acceptance that names who accepted it, and play moves", async () => {
    const f = fixture();
    const { projectId, leadSlug, leafId } = await openProject(f, "riskdemo");
    const reported = reportBlockingRisk(f, projectId, leadSlug, leafId);

    const disposition = await f.app.request(`/api/v1/risks/${reported.riskId}/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "accept",
        accepted_by: "Pablo",
        outcome:
          "Phase 1 proceeds self-verified by textstats-lead; phase 2 provisions an independent verifier.",
      }),
    });
    expect(disposition.status).toBe(201);
    const accepted = (await disposition.json()) as {
      disposition: { status: string; updateId: string };
      risk: {
        status: string;
        blocksExecution: boolean;
        disposition?: { acceptedBy?: string; outcome: string };
        history: Array<{ outcome: string }>;
      };
    };
    expect(accepted.disposition.status).toBe("accepted");
    expect(accepted.risk.status).toBe("accepted");
    expect(accepted.risk.blocksExecution).toBe(false);
    expect(accepted.risk.disposition?.acceptedBy, "the acceptance names who accepts the exposure").toBe(
      "Pablo",
    );
    expect(accepted.risk.disposition?.outcome).toContain("Accepted by Pablo:");

    const journal = f.journalStore.getById(accepted.disposition.updateId);
    expect(journal?.kind, "the disposition is a journal entry, not a hidden status").toBe("risk_updated");
    expect(journal?.metadata.riskId).toBe(reported.riskId);
    expect(journal?.metadata.status).toBe("accepted");

    const played = await f.app.request("/api/v1/projects/riskdemo/play", { method: "POST" });
    expect(played.status).toBe(202);
    const body = (await played.json()) as {
      gate?: { reason?: string };
      nextWorkItemId?: string | null;
    };
    expect(body.gate?.reason ?? null, "the risk no longer stops play").not.toBe("open_high_risk");
    expect(body.nextWorkItemId, "play continues into the next leaf").toBe(leafId);
  });

  it("defaults the accepting actor to the operator, and refuses a disposition with no outcome", async () => {
    const f = fixture();
    const { projectId, leadSlug, leafId } = await openProject(f, "riskdemo");
    const reported = reportBlockingRisk(f, projectId, leadSlug, leafId);

    const noOutcome = await f.app.request(`/api/v1/risks/${reported.riskId}/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mitigate", outcome: "   " }),
    });
    expect(noOutcome.status).toBe(400);
    const stillOpen = await f.app.request(`/api/v1/risks/${reported.riskId}`);
    expect(
      ((await stillOpen.json()) as { risk: { status: string } }).risk.status,
      "a refused disposition changes nothing",
    ).toBe("open");

    const unnamed = await f.app.request(`/api/v1/risks/${reported.riskId}/disposition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "accept", outcome: "One seat for phase 1 is the deliberate trade." }),
    });
    expect(unnamed.status).toBe(201);
    const body = (await unnamed.json()) as { risk: { disposition?: { acceptedBy?: string } } };
    expect(body.risk.disposition?.acceptedBy).toBe("operator");
  });

  it("writes the agent tool's disposition through the same code as the operator's", async () => {
    const f = fixture();
    const { projectId, leadSlug, leafId } = await openProject(f, "riskdemo");
    const reported = reportBlockingRisk(f, projectId, leadSlug, leafId);

    executeUpdateRisk(f.toolContext, {
      agent_slug: leadSlug,
      project_id: projectId,
      risk_id: reported.riskId,
      action: "mitigate",
      outcome: "A dedicated verifier seat was provisioned and both verification leaves reassigned to it.",
    });

    const readBack = await f.app.request(`/api/v1/risks/${reported.riskId}`);
    const risk = ((await readBack.json()) as {
      risk: {
        status: string;
        blocksExecution: boolean;
        disposition?: { byAgentSlug?: string; outcome: string };
      };
    }).risk;
    expect(risk.status).toBe("mitigated");
    expect(risk.blocksExecution).toBe(false);
    expect(risk.disposition?.byAgentSlug).toBe(leadSlug);
    expect(risk.disposition?.outcome).toContain("dedicated verifier seat");
  });
});

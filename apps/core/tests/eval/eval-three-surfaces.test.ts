import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { executeGetProject } from "../../src/agents/runtime/tools/get-project.js";
import { updateProject } from "../../src/application/projects.js";
import { getProjectOverview } from "../../src/application/pm/dashboard.js";
import { getProjectsRoster } from "../../src/application/projects-roster.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import type { KampakuToolContext } from "../../src/agents/runtime/tools/index.js";

/**
 * Suite 02's own lock: **one mutation, consistent reads, fields included.**
 *
 * The suite's oracle states the bar as a negative, which is what makes it testable: *"Diff the field set
 * returned by each surface for one entity; any field present on one and absent on another is a finding."*
 * So this does not assert that a field equals a value — it asserts that the surfaces agree about which
 * fields **exist**, for the entity the operator is looking at.
 *
 * The marker is the suite's own: `EVAL-SURFACE-MARKER`, written once and read back from every surface.
 * The mutation is the `description`, which is the field the suite's third prompt changes.
 *
 * Four reads, and they are not the same read:
 *
 * | Surface | What it is |
 * |---|---|
 * | REST `GET /api/v1/projects` | the raw store, what the CLI lists |
 * | REST `GET /api/v1/projects/:slug` | the enriched overview, what the UI's detail panel renders |
 * | `GET /api/v1/projects/roster` | the management projection, what the UI's table renders |
 * | `get_project` | the **agent path**, what chat can read |
 */

describe("eval 02 — one mutation, consistent reads across surfaces", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-three-surfaces-"));
    const config = loadConfig({
      dataDir,
      dbPath: join(dataDir, "kampaku.db"),
      workspaceRoot: join(dataDir, "workspace"),
      agentMode: "stub",
      plannerMode: "stub",
    });
    mkdirSync(config.workspaceRoot, { recursive: true });
    const { db } = createDb(config.dbPath);
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const conversationStore = new ConversationStore(db);
    const pmStore = new PmStore(db);
    const skillStore = new SkillStore(db);
    bootstrapProject(store, config);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    const toolContext: KampakuToolContext = {
      store,
      agentStore,
      conversationStore,
      pmStore,
      skillStore,
      config,
    };
    return { app, store, agentStore, pmStore, skillStore, config, toolContext };
  }

  const MARKER = "EVAL-SURFACE-MARKER";
  const MARKER_2 = "EVAL-SURFACE-MARKER-2";

  /** Creates the lead and the container through REST, which is the path suite 01's lock opened. */
  async function openOwnedContainer(app: ReturnType<typeof setup>["app"]) {
    const repositoryPath = join(dataDir!, "surface-demo");
    mkdirSync(repositoryPath, { recursive: true });
    await app.request("/api/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "surface-lead", name: "Surface Lead" }),
    });
    const response = await app.request("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "surface-demo",
        name: "Surface Demo",
        description: MARKER,
        repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
        project_lead_slug: "surface-lead",
      }),
    });
    expect(response.status).toBe(201);
    return { repositoryPath };
  }

  async function readAll(app: ReturnType<typeof setup>["app"], toolContext: KampakuToolContext) {
    const list = (await (await app.request("/api/v1/projects")).json()) as {
      projects: Array<Record<string, unknown>>;
    };
    const overview = (await (await app.request("/api/v1/projects/surface-demo")).json()) as Record<
      string,
      unknown
    >;
    // The roster answers a **tree** of `{ project, tasks }` nodes while the route calls the key
    // `projects`. Measured, not assumed — the first version of this test read it as a flat list and got
    // `undefined`. Interesting in its own right: the same word names two shapes on one API, which is the
    // three-surface defect's quiet cousin. Not a row, because the field is reachable either way.
    const roster = (await (await app.request("/api/v1/projects/roster")).json()) as {
      projects: Array<{ project: Record<string, unknown> }>;
    };
    const agent = executeGetProject(toolContext, { project_slug_or_id: "surface-demo" });

    return {
      list: list.projects.find((project) => project.slug === "surface-demo")!,
      overviewProject: (overview.project ?? {}) as Record<string, unknown>,
      rosterEntry: roster.projects.map((node) => node.project).find((project) => project.slug === "surface-demo")!,
      agent: agent.project as unknown as Record<string, unknown>,
    };
  }

  it("carries the marker on every surface after one mutation", async () => {
    const { app, toolContext } = setup();
    await openOwnedContainer(app);

    const before = await readAll(app, toolContext);
    for (const [surface, project] of Object.entries(before)) {
      expect(project.description, `${surface} does not carry the marker`).toBe(MARKER);
    }
  });

  /**
   * The suite's third prompt: change the description, then read it back everywhere. A surface that keeps
   * the old value after the store changed is the defect this bullet exists for.
   */
  it("reports the post-mutation value on every surface", async () => {
    const { app, toolContext, store, agentStore } = setup();
    await openOwnedContainer(app);

    updateProject(store, agentStore, "surface-demo", { description: MARKER_2 });

    const after = await readAll(app, toolContext);
    for (const [surface, project] of Object.entries(after)) {
      expect(project.description, `${surface} did not catch up`).toBe(MARKER_2);
    }
  });

  /**
   * The oracle's negative form: any field present on one surface and absent on another is a finding.
   *
   * Asserted between the two surfaces that describe the **same entity for the same purpose** — the
   * overview the UI's detail panel renders and the agent path chat reads. They are allowed to differ in
   * *shape* (the overview is wrapped, the tool returns a flat object), but not in *vocabulary*: a field
   * one can see and the other cannot is the three-surface defect.
   */
  it("uses one vocabulary for the identity fields the UI and chat both read", async () => {
    const { app, toolContext } = setup();
    await openOwnedContainer(app);
    const read = await readAll(app, toolContext);

    // The identity fields, and each surface's name for them. Compared by **meaning**, because the API
    // speaks snake_case-free camelCase and the tool speaks the operator's vocabulary.
    const pairs: Array<[string, string, string]> = [
      ["id", "id", "id"],
      ["slug", "slug", "slug"],
      ["name", "name", "name"],
      ["description", "description", "description"],
      ["status", "status", "status"],
      ["owner", "projectLeadAgentId", "projectLeadSlug"],
      ["repository paths", "repositories", "repositories"],
    ];

    const missing: string[] = [];
    for (const [label, overviewKey, agentKey] of pairs) {
      if (read.overviewProject[overviewKey] === undefined) missing.push(`overview has no ${label}`);
      if (read.agent[agentKey] === undefined) missing.push(`get_project has no ${label}`);
    }

    expect(missing).toEqual([]);
  });

  /**
   * The same paths, not merely the same number of them, on the surfaces that show metadata.
   *
   * Suite 02: *"The repository path is shown as a path string on every surface that shows project
   * metadata — not replaced by a count that cannot be verified against disk."*
   */
  it("agrees on the repository path string itself, not on a count", async () => {
    const { app, toolContext } = setup();
    const { repositoryPath } = await openOwnedContainer(app);

    const read = await readAll(app, toolContext);
    const expected = `file://${repositoryPath}`;

    // The list and the overview carry `repositories` as an array of records.
    const pathOnList = (
      read.list.repositories as Array<{ url: string }> | undefined
    )?.[0]?.url;
    expect(pathOnList, "GET /api/v1/projects lost the path").toBe(expected);

    const pathOnOverview = (
      read.overviewProject.repositories as Array<{ url: string }> | undefined
    )?.[0]?.url;
    expect(pathOnOverview, "GET /api/v1/projects/:slug lost the path").toBe(expected);

    const pathOnAgent = (read.agent.repositories as Array<{ url: string }>)[0]!.url;
    expect(pathOnAgent, "get_project lost the path").toBe(expected);
  });

  /**
   * The roster is the fourth read, and it is the one that does **not** carry the paths.
   *
   * Recorded as an inventory rather than as a wish, so the shape of the gap is machine-checked: the
   * roster is the projection the UI's *table* renders, and it can only say how many repositories a
   * project has. Suite 02's oracle asks for the path on every surface that shows project metadata, so
   * this is where that bullet does not hold — BOARD F-037.
   */
  it("records which surfaces still lack the repository path", async () => {
    const { app, toolContext } = setup();
    await openOwnedContainer(app);
    const read = await readAll(app, toolContext);

    const withoutPaths = Object.entries(read)
      .filter(([, project]) => project.repositories === undefined)
      .map(([surface]) => surface)
      .sort();

    expect(withoutPaths).toEqual(["rosterEntry"]);
    // And the roster does expose the lead as a slug, which is the field it has that the raw list does not.
    expect(read.rosterEntry.projectLeadSlug).toBe("surface-lead");
    expect(read.list.projectLeadAgentId).toBeTruthy();
  });

  /** The overview and the stores agree about the entity, which is what makes the reads comparable. */
  it("reads one entity, not four", async () => {
    const { app, toolContext, store, agentStore, pmStore } = setup();
    await openOwnedContainer(app);
    const read = await readAll(app, toolContext);
    const stored = store.getProjectBySlug("surface-demo")!;

    const ids = [
      read.list.id,
      read.overviewProject.id,
      read.rosterEntry.id,
      read.agent.id,
      stored.id,
    ];
    // One id, five readers. If two surfaces were reading different rows, this is where it shows.
    expect(new Set(ids).size).toBe(1);
    expect(new Set(ids).size).not.toBe(0);
    expect(getProjectOverview(store, pmStore, "surface-demo")).toBeDefined();

    // And the roster carries exactly one node for the slug, so no surface is reading a duplicate.
    const roster = getProjectsRoster(store, pmStore, agentStore, undefined, undefined);
    expect(roster.filter((node) => node.project.slug === "surface-demo")).toHaveLength(1);
  });
});

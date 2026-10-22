import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bodyFieldsFor, matchRegisteredRoute } from "../../src/api/request-body.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { BlockageStore } from "../../src/persistence/blockage-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { JournalStore } from "../../src/persistence/journal-store.js";
import { MemoryStore } from "../../src/persistence/memory-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { PostActionReviewStore } from "../../src/persistence/post-action-store.js";
import { QuestionStore } from "../../src/persistence/question-store.js";
import { RefusalStore } from "../../src/persistence/refusal-store.js";
import { ScopeRequestStore } from "../../src/persistence/scope-request-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";
import { WikiStore } from "../../src/persistence/wiki-store.js";

/**
 * A documented route is held to the fields it documents.
 *
 * Measured 2026-10-04, run `s08r12` (BOARD F-101). `POST /api/v1/projects` read
 * `c.req.json<{ slug, name, project_lead_slug, ... }>()` — a **type assertion, not a check** — so a body
 * naming the lead under any other spelling was accepted, ignored, and answered **201**:
 *
 * | request | was | is |
 * |---|---|---|
 * | `{slug, name, projectLeadAgentId}` | **201**, `projectLeadAgentId: null` | **400** `UNKNOWN_FIELD`, naming `project_lead_slug` |
 * | `{slug, name, totally_unknown_field, lead}` | **201**, no owner | **400** `UNKNOWN_FIELD`, both named |
 * | `{slug, name, project_lead_slug}` | **201**, owned | **201**, owned — and the body says so |
 *
 * The cost was not local. A container with no accountable lead cannot be planned: the front office will not
 * delegate into a work order nobody owns and holds no tool that attaches one — correctly — so the run spent
 * its first turn on an honest refusal and the operator repaired the container out of band. Silence is the
 * one answer that cannot be acted on, which is why both halves of the defect are locked here: the
 * **unrecognised** field, and the **recognised** field whose value is invalid.
 *
 * The rule is not one route's rule. Every mutating route declares the fields it reads in
 * `apps/core/src/api/request-body.ts`, the guard in `apps/core/src/api/app.ts` applies the table to all of
 * them, and the last block below fails if a route is ever registered without an entry — so the class cannot
 * come back route by route.
 */

describe("a route documents its fields, and refuses what it does not read", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-request-body-fields-"));
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
    const questionStore = new QuestionStore(db, agentStore, pmStore);
    const memoryStore = new MemoryStore(db);
    const blockageStore = new BlockageStore(db, agentStore, pmStore);
    const journalStore = new JournalStore(db, pmStore);
    const wikiStore = new WikiStore(db);
    const postActionStore = new PostActionReviewStore(db, pmStore);
    const refusalStore = new RefusalStore(db);
    // Suite 12's surface, wired like the real server: `POST /api/v1/scope-requests/:id/decide` is the one
    // route whose body guard would otherwise be checked against a fixture that never mounts it.
    const scopeRequestStore = new ScopeRequestStore(db);
    bootstrapProject(store, config);
    // Every store the real server passes, so the guard is exercised against the whole registered surface
    // rather than a subset: a route that is not mounted in this fixture could hide an undeclared body.
    const app = createApp(
      store,
      config,
      agentStore,
      pmStore,
      conversationStore,
      skillStore,
      questionStore,
      memoryStore,
      blockageStore,
      journalStore,
      wikiStore,
      db,
      postActionStore,
      refusalStore,
      scopeRequestStore,
    );
    return { app, store, agentStore, scopeRequestStore };
  }

  type App = ReturnType<typeof createTestApp>["app"];

  function post(app: App, path: string, body: unknown) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** A body that is not JSON at all — the shape that used to reach the handler's own `json()` as a 500. */
  function postRaw(app: App, path: string, body: string) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  async function lead(app: App, slug: string, name: string) {
    const created = await post(app, "/api/v1/agents", { slug, name });
    expect(created.status).toBe(201);
  }

  describe("F-101 — the field the run named was never read", () => {
    it("refuses the read-shape spelling instead of answering 201 with no owner", async () => {
      const { app, store, agentStore } = createTestApp();
      await lead(app, "textstats-lead", "textstats lead");
      const leadId = agentStore.getAgentBySlugOrId("textstats-lead")!.id;

      const response = await post(app, "/api/v1/projects", {
        slug: "probe-camel",
        name: "probe camel",
        // The spelling the seed sent: the *read* shape of a field this route writes as `project_lead_slug`.
        // Before the fix this was dropped and the answer was 201 with `projectLeadAgentId: null`.
        projectLeadAgentId: leadId,
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error?: string;
        code?: string;
        unknown_fields?: string[];
        accepted_fields?: string[];
        did_you_mean?: Record<string, string>;
      };
      expect(body.code).toBe("UNKNOWN_FIELD");
      expect(body.unknown_fields).toEqual(["projectLeadAgentId"]);
      // The accepted set is in the answer, so a caller does not have to guess the spelling this route reads.
      expect(body.accepted_fields).toContain("project_lead_slug");
      expect(body.did_you_mean?.projectLeadAgentId).toBe("project_lead_slug");
      expect(String(body.error)).toMatch(/project_lead_slug/);
      // And nothing was created: half the defect was the container nobody owns.
      expect(store.getProjectBySlug("probe-camel")).toBeUndefined();
    });

    it("refuses a body it does not recognise, naming every field it does not read", async () => {
      const { app, store } = createTestApp();

      const response = await post(app, "/api/v1/projects", {
        slug: "probe-nonsense",
        name: "probe nonsense",
        totally_unknown_field: "x",
        lead: "textstats-lead",
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        code?: string;
        unknown_fields?: string[];
        accepted_fields?: string[];
      };
      expect(body.code).toBe("UNKNOWN_FIELD");
      expect(body.unknown_fields).toEqual(["totally_unknown_field", "lead"]);
      expect(body.accepted_fields).toEqual(
        expect.arrayContaining(["slug", "name", "description", "repositories", "project_lead_slug"]),
      );
      expect(store.getProjectBySlug("probe-nonsense")).toBeUndefined();
    });

    it("answers the documented spelling with the owner attached, on the surface that caused it", async () => {
      const { app, store, agentStore } = createTestApp();
      await lead(app, "textstats-lead", "textstats lead");
      const leadId = agentStore.getAgentBySlugOrId("textstats-lead")!.id;

      const response = await post(app, "/api/v1/projects", {
        slug: "probe-snake",
        name: "probe snake",
        project_lead_slug: "textstats-lead",
      });

      expect(response.status).toBe(201);
      const created = (await response.json()) as { projectLeadAgentId?: string | null };
      // The property the row turns on: a 201 that named an owner cannot come back with no owner. The
      // caller reads it on the response itself, without a second request to find out what happened.
      expect(created.projectLeadAgentId).toBe(leadId);
      expect(store.getProjectBySlug("probe-snake")?.projectLeadAgentId).toBe(leadId);

      const read = await app.request("/api/v1/projects/probe-snake");
      expect(read.status).toBe(200);
      const readBody = (await read.json()) as { project?: { projectLeadAgentId?: string | null } };
      expect(readBody.project?.projectLeadAgentId).toBe(leadId);
    });

    it("refuses a recognised field whose value is invalid, and creates nothing", async () => {
      const { app, store } = createTestApp();

      // The other half of the same defect: a field the route *does* read, whose value names nothing. 201
      // here would be silence wearing the documented spelling.
      const response = await post(app, "/api/v1/projects", {
        slug: "orphan",
        name: "Orphan",
        project_lead_slug: "textstats-lead",
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string; code?: string };
      expect(body.code).toBe("VALIDATION");
      expect(String(body.error)).toMatch(/not found, so no container was created/i);
      expect(store.getProjectBySlug("orphan")).toBeUndefined();
    });

    it("still refuses, rather than 500s, when the body is not JSON at all", async () => {
      const { app } = createTestApp();

      const response = await postRaw(app, "/api/v1/projects", "{slug: nope");

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code?: string }).code).toBe("INVALID_BODY");
    });
  });

  describe("the same rule, on the rest of the surface", () => {
    it("refuses the seed's camelCase seat field and names the one it reads", async () => {
      const { app, agentStore } = createTestApp();
      await lead(app, "parent-lead", "Parent Lead");

      const response = await post(app, "/api/v1/agents", {
        slug: "textstats-lead",
        name: "textstats lead",
        // Both names come from the suite-08 seed, which sent them and was answered 201: `parentId` is the
        // record's own spelling, `parent_slug` is the one this route reads.
        parentId: agentStore.getAgentBySlugOrId("parent-lead")!.id,
        skills: ["workflow-memory"],
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        unknown_fields?: string[];
        did_you_mean?: Record<string, string>;
      };
      expect(body.unknown_fields).toEqual(["parentId", "skills"]);
      expect(body.did_you_mean?.parentId).toBe("parent_slug");
      // The seat the body asked for does not exist: a refused body leaves nothing behind.
      expect(agentStore.getAgentBySlugOrId("textstats-lead")).toBeUndefined();
    });

    it("refuses a body on a route that reads no body at all", async () => {
      const { app } = createTestApp();

      // `execute` takes its whole instruction from the URL. It read no field before and reads no field now,
      // so a field on it is the same defect with a smaller blast radius — and it is refused before the
      // handler can report a 404 for the item, because a request nothing reads is not a request to answer.
      const response = await post(app, "/api/v1/work-items/does-not-exist/execute", {
        force: true,
      });

      expect(response.status).toBe(400);
      expect(((await response.json()) as { code?: string }).code).toBe("UNKNOWN_FIELD");
    });

    it("does not refuse a spelling its handler genuinely reads", async () => {
      const { app } = createTestApp();
      const project = await post(app, "/api/v1/projects", { slug: "gated", name: "Gated" });
      expect(project.status).toBe(201);

      // `readDestructiveConfirmation` reads the camelCase spelling of the confirmation fields as well as the
      // snake_case one. The table lists what the handler reads, so this is a governed request that reaches
      // the gate (403, a confirmation that does not match) rather than a refused one (400, unknown field).
      const response = await app.request("/api/v1/projects/gated", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_lead_slug: null,
          confirmationReference: "never-recorded",
          confirmationToken: "never-issued",
        }),
      });

      expect(response.status).toBe(403);
      expect(((await response.json()) as { code?: string }).code).toBe("CONFIRMATION_MISMATCH");
    });
  });

  describe("the rule covers every mutating route, not the one that was measured", () => {
    /**
   * The decision on one scope expansion, over HTTP — the surface the web button and `kampaku scope` call.
   *
   * Locked here rather than only in the store, because the store was green while the route answered 500:
   * measured 2026-10-21 on suite 12's second run (`s12r2`), `POST /api/v1/scope-requests/:id/decide` read a
   * body and declared no fields, so the guard refused **every** decision — *"declares no fields … Add the
   * route to REQUEST_BODY_FIELDS"* — and neither the CLI nor the dashboard could answer an expansion, while
   * the ten store-level cases passed. A lock that never crosses the boundary the operator uses proves half.
   */
  it("records one decision through the route, and refuses what is not a decision", async () => {
    const { app, scopeRequestStore } = createTestApp();
    const filed = scopeRequestStore.request({
      projectSlug: "request-body-fixture",
      request: "Add payments.",
      domain: "payments",
      summary: "Add a payments surface.",
      blastRadius: ["src/payments/ (does not exist yet — this expansion creates it)"],
    }).record;

    const decided = await post(app, `/api/v1/scope-requests/${filed.id}/decide`, { approve: true });
    expect(decided.status).toBe(200);
    expect(((await decided.json()) as { request: { status: string } }).request.status).toBe("approved");

    // Not a decision: the field the route reads is absent, so the guard refuses rather than guessing "yes".
    const silent = await post(app, `/api/v1/scope-requests/${filed.id}/decide`, { decision: "sure" });
    expect(silent.status).toBe(400);

    // A field nobody reads is a claim about the surface, and it is refused before the handler runs.
    const extra = await post(app, `/api/v1/scope-requests/${filed.id}/decide`, { approve: true, ids: [filed.id] });
    expect(extra.status).toBe(400);

    // One decision per request: the second answer to the same row is a conflict, not an overwrite.
    const again = await post(app, `/api/v1/scope-requests/${filed.id}/decide`, { approve: false });
    expect(again.status).toBe(409);
  });

  it("declares the fields of every mutating /api/v1 route Hono knows", () => {
      const { app } = createTestApp();
      const mutating = app.routes
        .filter(
          (route) =>
            ["POST", "PUT", "PATCH", "DELETE"].includes(route.method.toUpperCase()) &&
            route.path.startsWith("/api/v1"),
        )
        .map((route) => `${route.method.toUpperCase()} ${route.path}`);

      expect(mutating.length).toBeGreaterThan(30);
      // A route registered without an entry in the table is a route whose bodies nobody checks. This is what
      // makes the guard's 500 (UndeclaredBodyRouteError) unreachable, and it is the assertion that keeps a
      // new route from re-opening F-101 one endpoint at a time.
      expect(mutating.filter((key) => bodyFieldsFor(...(key.split(" ") as [string, string])) === undefined)).toEqual(
        [],
      );
    });

    it("declares no route that does not exist", async () => {
      const { app } = createTestApp();
      const registered = app.routes
        .filter((route) => route.path.startsWith("/api/v1"))
        .map((route) => `${route.method.toUpperCase()} ${route.path}`);

      // The other direction: a table entry for a route nobody registered is a stale claim about the surface,
      // and it would hide a rename. Both directions are checked so the table cannot drift either way.
      const { REQUEST_BODY_FIELDS } = await import("../../src/api/request-body.js");
      const stale = Object.keys(REQUEST_BODY_FIELDS).filter((key) => !registered.includes(key));
      expect(stale).toEqual([]);
    });

    it("matches a concrete path to the pattern it was registered under", () => {
      const routes = [
        { path: "/api/v1/projects", method: "POST" },
        { path: "/api/v1/projects/:idOrSlug", method: "PATCH" },
        { path: "/api/v1/workers/:workerId/jobs:lease", method: "POST" },
      ];

      expect(matchRegisteredRoute(routes, "POST", "/api/v1/projects")?.path).toBe("/api/v1/projects");
      expect(matchRegisteredRoute(routes, "PATCH", "/api/v1/projects/textstats")?.path).toBe(
        "/api/v1/projects/:idOrSlug",
      );
      expect(matchRegisteredRoute(routes, "POST", "/api/v1/workers/w1/jobs:lease")?.path).toBe(
        "/api/v1/workers/:workerId/jobs:lease",
      );
      // A path nobody registered is Hono's 404 to answer, not this guard's: it judges bodies, not addresses.
      expect(matchRegisteredRoute(routes, "POST", "/api/v1/nothing-here")).toBeUndefined();
    });
  });
});

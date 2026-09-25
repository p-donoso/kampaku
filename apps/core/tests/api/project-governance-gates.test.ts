import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { bootstrapProject } from "../../src/application/projects.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { ConversationStore } from "../../src/persistence/conversation-store.js";
import { PmStore } from "../../src/persistence/pm-store.js";
import { SkillStore } from "../../src/persistence/skill-store.js";
import { Store } from "../../src/persistence/store.js";

/**
 * Governance routes gated independently of the agent path.
 *
 * Suite 04's clause: *"a tool that is denied to an agent but reachable through an ungated REST route is a
 * finding."* Measured 2026-09-24, three requests made that case — and all three succeeded:
 *
 * | Request | Result |
 * |---|---|
 * | `DELETE /api/v1/agents/<lead>` | **204**, the agent was gone |
 * | `DELETE /api/v1/projects/<slug>` | **204**, the project was gone |
 * | `PATCH /api/v1/projects/<slug>` reassigning the lead and rewriting `repositories` to `file:///tmp/evil` | **200**, and it created `/tmp/evil`, ran `git init` and seeded six files |
 *
 * The mechanism (`recordDestructiveRequest` / `confirmDestructiveAction` / `consumeDestructiveAction`) is
 * locked on its own in `tests/persistence/destructive-action.test.ts`. This file is the half that was
 * missing: it drives the **routes**, because a locked mechanism the routes do not call is still a live
 * defect. The [security model](../../../../docs/security/security-model.md) puts these operations in the
 * **gated** tier — *"a named, recorded approval that states the consequence. One unconfirmed turn is never
 * enough"* — and the tests assert exactly that: the first request has no effect and answers 202.
 */
describe("governance routes are gated in runtime code", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-governance-gates-"));
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
    bootstrapProject(store, config);
    const app = createApp(store, config, agentStore, pmStore, conversationStore, skillStore);
    return { app, store, agentStore };
  }

  type App = ReturnType<typeof createTestApp>["app"];

  async function post(app: App, path: string, body: unknown) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function patch(app: App, path: string, body: unknown) {
    return app.request(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function createLeadAndProject(app: App) {
    await post(app, "/api/v1/agents", {
      slug: "s4-lead",
      name: "S4 Lead",
      responsibilities: "Own the work order",
    });
    await post(app, "/api/v1/projects", {
      slug: "s4-demo",
      name: "S4 Demo",
      project_lead_slug: "s4-lead",
    });
  }

  interface Challenge {
    status: string;
    action: string;
    target: string;
    consequence: string;
    reference: string;
    confirmationToken: string;
  }

  async function challengeOf(response: Response): Promise<Challenge> {
    expect(response.status).toBe(202);
    return (await response.json()) as Challenge;
  }

  describe("DELETE /api/v1/projects/:idOrSlug", () => {
    it("answers 202 with the consequence and deletes nothing on the first request", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);

      const challenge = await challengeOf(await app.request("/api/v1/projects/s4-demo", { method: "DELETE" }));

      expect(challenge.status).toBe("confirmation_required");
      expect(challenge.action).toBe("project.delete");
      expect(challenge.reference).toBeTruthy();
      expect(challenge.confirmationToken).toBeTruthy();
      expect(challenge.consequence).toMatch(/deletes project "s4-demo"/i);
      // The half that matters: the project is still there.
      expect(store.getProjectBySlug("s4-demo")).toBeDefined();
    });

    it("deletes only when the confirmation is presented", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);

      const challenge = await challengeOf(await app.request("/api/v1/projects/s4-demo", { method: "DELETE" }));

      const confirmed = await app.request("/api/v1/projects/s4-demo", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation_reference: challenge.reference,
          confirmation_token: challenge.confirmationToken,
          confirmed_by: "test",
        }),
      });

      expect(confirmed.status).toBe(204);
      expect(store.getProjectBySlug("s4-demo")).toBeUndefined();
    });

    it("refuses a confirmation for a different project", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);
      await post(app, "/api/v1/projects", { slug: "other", name: "Other" });

      const challenge = await challengeOf(await app.request("/api/v1/projects/s4-demo", { method: "DELETE" }));

      // Same token, a different target — the token is bound to the exact target, so it must not match.
      const refused = await app.request("/api/v1/projects/other", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation_reference: challenge.reference,
          confirmation_token: challenge.confirmationToken,
        }),
      });

      expect(refused.status).toBe(403);
      expect(store.getProjectBySlug("other")).toBeDefined();
      expect(store.getProjectBySlug("s4-demo")).toBeDefined();
    });

    it("consumes the confirmation, so it cannot delete a second project", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);
      await post(app, "/api/v1/projects", { slug: "other", name: "Other" });

      const challenge = await challengeOf(await app.request("/api/v1/projects/s4-demo", { method: "DELETE" }));

      const first = await app.request("/api/v1/projects/s4-demo", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation_reference: challenge.reference,
          confirmation_token: challenge.confirmationToken,
        }),
      });
      expect(first.status).toBe(204);

      // The same confirmation against the same URI now has nothing left; the token is spent, so a second
      // target is refused too.
      const after = await app.request(
        `/api/v1/projects/other?confirmation_reference=${challenge.reference}&confirmation_token=${challenge.confirmationToken}`,
        { method: "DELETE" },
      );
      expect(after.status).toBe(403);
      expect(store.getProjectBySlug("other")).toBeDefined();
    });
  });

  describe("DELETE /api/v1/agents/:slugOrId", () => {
    it("answers 202 and leaves the agent in place on the first request", async () => {
      const { app, agentStore } = createTestApp();
      await createLeadAndProject(app);

      const challenge = await challengeOf(await app.request("/api/v1/agents/s4-lead", { method: "DELETE" }));

      expect(challenge.action).toBe("agent.delete");
      expect(challenge.consequence).toMatch(/deletes agent "s4-lead"/i);
      expect(agentStore.getAgentBySlugOrId("s4-lead")).toBeDefined();
    });

    it("deletes when the confirmation is presented", async () => {
      const { app, agentStore } = createTestApp();
      await createLeadAndProject(app);

      const challenge = await challengeOf(await app.request("/api/v1/agents/s4-lead", { method: "DELETE" }));

      const confirmed = await app.request("/api/v1/agents/s4-lead", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation_reference: challenge.reference,
          confirmation_token: challenge.confirmationToken,
        }),
      });

      expect(confirmed.status).toBe(204);
      expect(agentStore.getAgentBySlugOrId("s4-lead")).toBeUndefined();
    });

    it("still refuses the built-in agent without a challenge", async () => {
      const { app } = createTestApp();

      // A built-in cannot be deleted at all, so it is refused before the gate rather than asked to confirm.
      const response = await app.request("/api/v1/agents/kampaku", { method: "DELETE" });
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/v1/projects/:idOrSlug — the governance fields", () => {
    it("gates a lead reassignment and does not change the lead on the first request", async () => {
      const { app, store, agentStore } = createTestApp();
      await createLeadAndProject(app);
      await post(app, "/api/v1/agents", { slug: "s4-random", name: "Random" });

      const challenge = await challengeOf(
        await patch(app, "/api/v1/projects/s4-demo", { project_lead_slug: "s4-random" }),
      );

      expect(challenge.action).toBe("project.update_governance");
      expect(challenge.consequence).toMatch(/reassigns the project lead to "s4-random"/i);
      // The lead is still the original one.
      const before = store.getProjectBySlug("s4-demo")!;
      expect(agentStore.getAgentBySlugOrId(before.projectLeadAgentId!)?.slug).toBe("s4-lead");
    });

    it("applies the lead reassignment once confirmed", async () => {
      const { app, store, agentStore } = createTestApp();
      await createLeadAndProject(app);
      await post(app, "/api/v1/agents", { slug: "s4-random", name: "Random" });

      const challenge = await challengeOf(
        await patch(app, "/api/v1/projects/s4-demo", { project_lead_slug: "s4-random" }),
      );

      const confirmed = await patch(app, "/api/v1/projects/s4-demo", {
        project_lead_slug: "s4-random",
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
      });

      expect(confirmed.status).toBe(200);
      const after = store.getProjectBySlug("s4-demo")!;
      expect(agentStore.getAgentBySlugOrId(after.projectLeadAgentId!)?.slug).toBe("s4-random");
    });

    it("does not gate a metadata-only update", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);

      const response = await patch(app, "/api/v1/projects/s4-demo", { description: "Just a note" });

      expect(response.status).toBe(200);
      expect(store.getProjectBySlug("s4-demo")?.description).toBe("Just a note");
    });

    /**
     * The third attack, and the worst one: it wrote six files into a directory nobody named.
     *
     * Two defects met here. The route passed `allowMissingPath: true` on every repositories update, so the
     * existence check was off; `updateProject` then created the directory, ran `git init` and seeded it.
     * The hardcode is gone — the existence check runs now — and the write is gated besides.
     */
    it("creates nothing at a path nobody asked for, on either step", async () => {
      const { app } = createTestApp();
      await createLeadAndProject(app);
      const evil = join(dataDir!, "not-a-real-repo");
      const repositories = [{ url: `file://${evil}`, role: "web" }];

      const challenge = await challengeOf(
        await patch(app, "/api/v1/projects/s4-demo", { repositories }),
      );
      expect(challenge.consequence).toMatch(/rewrites the linked repositories/i);
      // No directory is created by the request that only records the intent.
      expect(existsSync(evil)).toBe(false);

      const confirmed = await patch(app, "/api/v1/projects/s4-demo", {
        repositories,
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
      });

      // The action runs, and the validation that is now reachable refuses it: the path does not exist.
      expect(confirmed.status).toBe(400);
      expect(String(((await confirmed.json()) as { error?: string }).error)).toMatch(
        /does not exist as a directory/i,
      );
      expect(existsSync(evil)).toBe(false);
    });

    it("links an existing repository once confirmed", async () => {
      const { app, store } = createTestApp();
      await createLeadAndProject(app);
      const real = join(dataDir!, "real-repo");
      mkdirSync(real, { recursive: true });
      const repositories = [{ url: `file://${real}`, role: "web" as const }];

      const challenge = await challengeOf(
        await patch(app, "/api/v1/projects/s4-demo", { repositories }),
      );

      const confirmed = await patch(app, "/api/v1/projects/s4-demo", {
        repositories,
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
      });

      expect(confirmed.status).toBe(200);
      expect(store.getProjectBySlug("s4-demo")?.repositories[0]?.url).toBe(`file://${real}`);
    });

    it("refuses a confirmation whose payload changed after the request", async () => {
      const { app, store, agentStore } = createTestApp();
      await createLeadAndProject(app);
      await post(app, "/api/v1/agents", { slug: "s4-random", name: "Random" });

      const challenge = await challengeOf(
        await patch(app, "/api/v1/projects/s4-demo", { project_lead_slug: "s4-random" }),
      );

      // Same reference and token, a different payload the operator never saw.
      const refused = await patch(app, "/api/v1/projects/s4-demo", {
        project_lead_slug: "s4-lead",
        confirmation_reference: challenge.reference,
        confirmation_token: challenge.confirmationToken,
      });

      expect(refused.status).toBe(403);
      const after = store.getProjectBySlug("s4-demo")!;
      expect(agentStore.getAgentBySlugOrId(after.projectLeadAgentId!)?.slug).toBe("s4-lead");
    });
  });
});

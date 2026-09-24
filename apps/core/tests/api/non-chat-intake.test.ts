import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
 * The intake path from the surfaces that are **not** chat.
 *
 * Three rows came out of writing suite 01's web lock, and all three are one story: chat could open an
 * owned work order while the operator's documented surfaces could not do the equivalent, and the failures
 * along the way did not say what had gone wrong.
 *
 * | Row | Measured | Fixed by |
 * |---|---|---|
 * | F-033 | A **bare absolute path** skipped every repository check, because `validateRepositories` only entered its block for `file://` | normalising a bare path and validating it |
 * | F-035 | A duplicate slug answered **`500 Internal Server Error`** with a bare body, so a retry could not be told from a crash | a `CONFLICT` check and a route that maps it to 409 |
 * | F-036 | **No REST route could create an agent**, and `POST /api/v1/projects` took no lead, so the UI could never show an owner | `POST /api/v1/agents`, and `project_lead_slug` on the project route |
 */

describe("intake from the non-chat surfaces", () => {
  let dataDir: string | undefined;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = undefined;
  });

  function createTestApp() {
    dataDir = mkdtempSync(join(tmpdir(), "kampaku-non-chat-intake-"));
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

  function post(app: ReturnType<typeof createTestApp>["app"], path: string, body: unknown) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("F-033 — a repository path is validated however it is written", () => {
    it("refuses a bare absolute path that does not exist, instead of storing it", async () => {
      const { app } = createTestApp();

      const response = await post(app, "/api/v1/projects", {
        slug: "typo-repo",
        name: "Typo Repo",
        // No `file://`. The whole validation block used to be skipped for this, so a path that does not
        // exist was recorded and reported as a linked repository.
        repositories: [{ url: "/tmp/definitely-not-a-directory-kampaku", role: "web" }],
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(String(body.error)).toMatch(/does not exist as a directory/i);
    });

    it("stores the documented form when the caller writes a bare path", async () => {
      const { app, store } = createTestApp();
      const real = join(dataDir!, "bare-path-repo");
      mkdirSync(real, { recursive: true });

      const response = await post(app, "/api/v1/projects", {
        slug: "bare-path",
        name: "Bare Path",
        repositories: [{ url: real, role: "core" }],
      });

      expect(response.status).toBe(201);
      // One spelling in the store, whichever way it arrived. Two spellings of one path is the same defect
      // as two names for one setting.
      expect(store.getProjectBySlug("bare-path")?.repositories[0]?.url).toBe(`file://${real}`);
    });

    it("refuses a bare path that points inside the platform workspace", async () => {
      const { app } = createTestApp();
      const inside = join(dataDir!, "workspace", "sneaky");
      mkdirSync(inside, { recursive: true });

      const response = await post(app, "/api/v1/projects", {
        slug: "inside-workspace",
        name: "Inside Workspace",
        repositories: [{ url: inside, role: "web" }],
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(String(body.error)).toMatch(/inside the Kampaku workspace/i);
    });
  });

  describe("F-035 — a duplicate is a conflict, and it says so", () => {
    it("answers 409 with the message, not 500 with a bare body", async () => {
      const { app } = createTestApp();

      const first = await post(app, "/api/v1/projects", { slug: "dupe", name: "Dupe" });
      expect(first.status).toBe(201);

      const second = await post(app, "/api/v1/projects", { slug: "dupe", name: "Dupe" });

      expect(second.status).toBe(409);
      const body = (await second.json()) as { error?: string; code?: string };
      expect(body.code).toBe("CONFLICT");
      expect(String(body.error)).toMatch(/already exists/i);
    });

    it("leaves exactly one container behind", async () => {
      const { app, store } = createTestApp();

      await post(app, "/api/v1/projects", { slug: "dupe", name: "Dupe" });
      await post(app, "/api/v1/projects", { slug: "dupe", name: "Dupe" });

      expect(store.listProjects().filter((project) => project.slug === "dupe")).toHaveLength(1);
    });

    it("answers a duplicate agent with a conflict too", async () => {
      const { app } = createTestApp();

      const first = await post(app, "/api/v1/agents", { slug: "dupe-lead", name: "Dupe Lead" });
      expect(first.status).toBe(201);

      const second = await post(app, "/api/v1/agents", { slug: "dupe-lead", name: "Dupe Lead" });
      expect(second.status).toBe(409);
      expect(((await second.json()) as { code?: string }).code).toBe("CONFLICT");
    });
  });

  describe("F-036 — a non-chat surface can open an OWNED work order", () => {
    it("creates an agent through REST, which no route could do before", async () => {
      const { app, agentStore } = createTestApp();

      const response = await post(app, "/api/v1/agents", {
        slug: "surface-lead",
        name: "Surface Lead",
        responsibilities: "Own the work order",
      });

      expect(response.status).toBe(201);
      expect(agentStore.getAgentBySlugOrId("surface-lead")).toBeDefined();
      // Returned through the same enrichment the read route uses, so create and fetch cannot differ.
      const body = (await response.json()) as { agent?: { slug?: string } };
      expect(body.agent?.slug).toBe("surface-lead");
    });

    it("opens a container with an accountable owner, and the owner resolves to a slug", async () => {
      const { app, store, agentStore } = createTestApp();
      await post(app, "/api/v1/agents", { slug: "surface-lead", name: "Surface Lead" });

      const response = await post(app, "/api/v1/projects", {
        slug: "owned-container",
        name: "Owned Container",
        project_lead_slug: "surface-lead",
      });

      expect(response.status).toBe(201);
      const project = store.getProjectBySlug("owned-container");
      // This is the assertion the UI's OWNER column needed: before the fix it rendered `—`, because the
      // route accepted no lead at all.
      expect(project?.projectLeadAgentId).toBeTruthy();
      expect(agentStore.getAgentBySlugOrId(project!.projectLeadAgentId!)?.slug).toBe("surface-lead");
    });

    it("refuses an unknown lead without persisting a container", async () => {
      const { app, store } = createTestApp();

      const response = await post(app, "/api/v1/projects", {
        slug: "orphan",
        name: "Orphan",
        project_lead_slug: "ghost",
      });

      expect(response.status).toBe(400);
      expect(String(((await response.json()) as { error?: string }).error)).toMatch(
        /not found, so no container was created/i,
      );
      // The half that protects the store: no orphan from the failure path.
      expect(store.getProjectBySlug("orphan")).toBeUndefined();
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { Store } from "../../src/persistence/store.js";
import {
  createProject,
  updateProject,
  validateRepositories,
} from "../../src/application/projects.js";

/**
 * Repository validation belongs to the application layer, not to one tool.
 *
 * It was first written inside the `create_project` tool, and that was insufficient: the agent created
 * the container, then linked the repository through `update_project`, which had no validation — so a
 * project ended up holding a `file://` path that did not exist on disk. Validation at one call site
 * protects one call site.
 */
describe("repository policy", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-repo-policy-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    return { store, agentStore, dir, workspaceRoot: join(dir, "workspace") };
  }

  it("refuses a repository inside the workspace by default across every entry point", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const insidePath = join(workspaceRoot, "voice-language-trainer");
    mkdirSync(insidePath, { recursive: true });
    const repository = [{ url: `file://${insidePath}`, role: "web", defaultBranch: "main" }];

    expect(() => validateRepositories(repository, { workspaceRoot })).toThrow(
      "is inside the Kampaku workspace",
    );
    expect(() =>
      createProject(store, { name: "VLT", repositories: repository }, { workspaceRoot }),
    ).toThrow("is inside the Kampaku workspace");

    createProject(store, { name: "VLT" }, { workspaceRoot });
    expect(() =>
      updateProject(store, agentStore, "vlt", { repositories: repository }, { workspaceRoot }),
    ).toThrow("is inside the Kampaku workspace");
  });

  it("refuses a missing path from create_project, which does not seed a checkout", () => {
    const { store, workspaceRoot } = setup();
    expect(() =>
      createProject(
        store,
        { name: "VLT", repositories: [{ url: "file:///workspace/voice-language-trainer" }] },
        { workspaceRoot },
      ),
    ).toThrow("does not exist as a directory");
    expect(store.listProjects()).toHaveLength(0);
  });

  it("accepts a missing path from update_project's seeding path and creates the checkout", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");

    const updated = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot },
    );

    // The directory is created and seeded, so the recorded link is not a link to nothing.
    expect(existsSync(repoPath)).toBe(true);
    expect(existsSync(join(repoPath, "README.md"))).toBe(true);
    expect(existsSync(join(repoPath, ".gitignore"))).toBe(true);
    expect(updated.repositories[0]?.url).toBe(`file://${repoPath}`);
    expect(updated.repoBootstrap?.createdDirectory).toBe(true);
    expect(updated.repoBootstrap?.seeded.length).toBeGreaterThan(0);
  });

  it("never overwrites files that already exist in the checkout", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");
    mkdirSync(repoPath, { recursive: true });

    const first = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot },
    );
    expect(first.repoBootstrap?.seeded).toContain("README.md");

    // A second, separate project pointing at the same checkout must skip, not re-write.
    const other = createProject(store, { name: "Other" }, { workspaceRoot });
    const second = updateProject(
      store,
      agentStore,
      other.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot },
    );
    expect(second.repoBootstrap?.seeded ?? []).toEqual([]);
    expect(second.repoBootstrap?.skipped).toContain("README.md");
  });

  it("honours the explicit workspace opt-in", () => {
    const { dir, workspaceRoot } = setup();
    const insidePath = join(workspaceRoot, "voice-language-trainer");
    mkdirSync(insidePath, { recursive: true });

    const validated = validateRepositories(
      [{ url: `file://${insidePath}`, role: "web", defaultBranch: "main" }],
      { workspaceRoot, allowWorkspaceRepository: true },
    );
    expect(validated).toHaveLength(1);
    expect(validated[0]?.url).toBe(`file://${insidePath}`);
    expect(dir).toBeTruthy();
  });
});

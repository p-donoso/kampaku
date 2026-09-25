import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

  /**
   * The escape hatch is opt-in per call, not a property of `updateProject`.
   *
   * It used to be hardcoded `true` inside `updateProject`, which made the existence check unreachable from
   * every caller — REST included — and let a single unauthenticated `PATCH ... repositories:
   * [file:///tmp/evil]` create the directory, run `git init` and seed six files (BOARD F-042). A caller that
   * means to create and seed a checkout now says so; nobody gets it by default.
   */
  it("refuses a missing path from updateProject unless the caller opts in", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");

    expect(() =>
      updateProject(
        store,
        agentStore,
        project.slug,
        { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
        { workspaceRoot },
      ),
    ).toThrow("does not exist as a directory");
    // And nothing was created on the way to the refusal.
    expect(existsSync(repoPath)).toBe(false);
  });

  it("accepts a missing path when the caller opts in, and creates the checkout", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");

    const updated = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot, allowMissingPath: true },
    );

    // The directory is created and seeded, so the recorded link is not a link to nothing.
    expect(existsSync(repoPath)).toBe(true);
    expect(existsSync(join(repoPath, "README.md"))).toBe(true);
    expect(existsSync(join(repoPath, ".gitignore"))).toBe(true);
    expect(updated.repositories[0]?.url).toBe(`file://${repoPath}`);
    expect(updated.repoBootstrap?.createdDirectory).toBe(true);
    expect(updated.repoBootstrap?.seeded.length).toBeGreaterThan(0);
  });

  /**
   * Regression: seeding used to be gated on "this project has never had an external link". A project
   * that held a *wrong* link — pointing at a path that did not exist — could therefore never be
   * seeded afterwards, and stayed permanently un-seeded while claiming a repository.
   */
  it("seeds a correct path even when the project previously held a different link", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });

    // First link points somewhere that gets removed, mimicking a stale/incorrect link.
    const wrongPath = join(dir, "wrong");
    mkdirSync(wrongPath, { recursive: true });
    updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${wrongPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot },
    );
    rmSync(wrongPath, { recursive: true, force: true });
    expect(existsSync(wrongPath)).toBe(false);

    // Re-linking to the right path must still create and seed it.
    const rightPath = join(dir, "voice-language-trainer");
    const updated = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${rightPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot, allowMissingPath: true },
    );

    expect(existsSync(rightPath)).toBe(true);
    expect(existsSync(join(rightPath, "README.md"))).toBe(true);
    expect(updated.repoBootstrap?.createdDirectory).toBe(true);
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

  /**
   * The platform records `defaultBranch: main`, so the checkout has to be a repository.
   * Measured: a seeded project declared a default branch while its directory had no `.git` at all,
   * because "seed the repo" was implemented as "write files".
   */
  it("initialises the git repository, so the recorded default branch means something", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");

    const updated = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot, allowMissingPath: true },
    );

    expect(updated.repoBootstrap?.initializedRepository).toBe(true);
    expect(existsSync(join(repoPath, ".git"))).toBe(true);
  });

  it("does not re-initialise a checkout that is already a repository", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "voice-language-trainer");
    mkdirSync(join(repoPath, ".git"), { recursive: true });
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });

    const updated = updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot },
    );

    expect(updated.repoBootstrap?.initializedRepository).toBeUndefined();
  });

  /**
   * The seeded README used to document `npm install`, `npm run dev`, `npm test` and `npm run build`
   * in a checkout with no `package.json` — instructions that could only fail. A scaffold may only
   * claim what it actually wrote.
   */
  it("seeds a README that does not promise commands the checkout cannot run", () => {
    const { store, agentStore, dir, workspaceRoot } = setup();
    const project = createProject(store, { name: "Voice Language Trainer" }, { workspaceRoot });
    const repoPath = join(dir, "voice-language-trainer");

    updateProject(
      store,
      agentStore,
      project.slug,
      { repositories: [{ url: `file://${repoPath}`, role: "web", defaultBranch: "main" }] },
      { workspaceRoot, allowMissingPath: true },
    );

    const readme = readFileSync(join(repoPath, "README.md"), "utf8");
    expect(existsSync(join(repoPath, "package.json"))).toBe(false);
    // No documented command without a manifest to run it against.
    expect(readme).not.toContain("npm install");
    expect(readme).not.toContain("npm run dev");
    expect(readme).not.toContain("npm test");
    // And it says plainly what it is instead, so a stranger is not misled.
    expect(readme).toContain("scaffold only");
    expect(readme).toContain("no dependency manifest");
    expect(readme).toContain("every command in this file can actually be run");
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

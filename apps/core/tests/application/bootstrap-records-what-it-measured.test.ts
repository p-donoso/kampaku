import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapKampakuProject } from "../../src/application/bootstrap/kampaku-project.js";
import { loadConfig } from "../../src/config.js";
import { createDb } from "../../src/persistence/db.js";
import { Store } from "../../src/persistence/store.js";

/**
 * **A stored path that could have been measured is a claim.**
 *
 * Measured on suite 06 (2026-09-24, `docs/eval/archive/baseline-2026-09-24.md`): `bootstrap` recorded four `file://`
 * repository links, and with `KAMPAKU_WORKSPACE` pointed at an empty directory **none of the four existed** —
 * `test -d` answered no for all of them. It also recorded `defaultBranch: "main"` for each, a branch nobody had read.
 *
 * Two reasons it could: `bootstrapKampakuProject` writes through `store.createProject` directly, so
 * `validateRepositories` — which refuses a `file://` path that is not a directory — never runs; and the branch is a
 * literal in the same object.
 *
 * What this locks: a link is recorded only for a path that is there, its branch is the one the checkout is on (or
 * absent, which is the honest answer when it cannot be read), and a path that is missing is **named as skipped**
 * instead of being recorded as though it existed.
 */
describe("what bootstrap records about its own repositories (F-028)", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function store(): Store {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-bootstrap-claims-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "kampaku.db"));
    return new Store(db);
  }

  it("records no link for a path that is not there, and says which ones it skipped", () => {
    const workspace = mkdtempSync(join(tmpdir(), "kampaku-workspace-empty-"));
    dirs.push(workspace);
    const db = store();
    const config = { ...loadConfig(), workspaceRoot: workspace, dataDir: workspace };

    const result = bootstrapKampakuProject(db, config);

    expect(result.project.repositories, "an empty workspace has no repository to link").toEqual([]);
    // Not silent: the reasons are named, one per candidate.
    expect(result.skipped.length).toBeGreaterThan(0);
    for (const skip of result.skipped) {
      expect(skip.url).toContain("file://");
      expect(skip.reason).toContain("does not exist");
    }
  });

  it("records the branch the checkout is on, not a templated 'main'", () => {
    const workspace = mkdtempSync(join(tmpdir(), "kampaku-workspace-real-"));
    dirs.push(workspace);
    // One of the platform's own repositories, on a branch that is not `main`.
    const core = join(workspace, "apps/core");
    mkdirSync(join(core, ".git"), { recursive: true });
    writeFileSync(join(core, ".git", "HEAD"), "ref: refs/heads/trunk\n");
    const db = store();
    const config = { ...loadConfig(), workspaceRoot: workspace, dataDir: workspace };

    const result = bootstrapKampakuProject(db, config);

    const linked = result.project.repositories.find((repo) => repo.url === `file://${core}`);
    expect(linked, "the repository that is there is linked").toBeDefined();
    expect(linked!.role).toBe("core");
    expect(linked!.defaultBranch, "the branch is read, not assumed").toBe("trunk");
    // And nothing else was invented for the three repositories that are not there.
    expect(result.project.repositories).toHaveLength(1);
  });
});

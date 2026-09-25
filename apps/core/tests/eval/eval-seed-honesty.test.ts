import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { Store } from "../../src/persistence/store.js";
import { createProject } from "../../src/application/projects.js";

/**
 * Suite 06's first lock: **the seed reports what it wrote, and the README only claims what exists.**
 *
 * The failure this prevents has been measured twice. In the platform's own history, a seeded README
 * documented `npm install`, `npm run dev`, `npm test` and `npm run build` in a checkout containing no
 * `package.json` — a stranger's first four commands fail, for a reason the repository never states (BOARD
 * F-003). And in this suite's run 3, on 2026-09-25, the factory returned a reply that named the seeding work
 * as still to do while the operator's checkout held zero entries; the run before that produced a checkout
 * with files and a reply that said nothing had been created (BOARD F-051, F-052).
 *
 * A seed may only assert what it can be checked against:
 *
 * 1. every file it lists as seeded exists on disk, and the files on disk are the ones it listed;
 * 2. a checkout with no dependency manifest says so, and documents no install / build / test command;
 * 3. no fenced command block appears in the README, because a fenced block is exactly what a stranger
 *    copies and runs;
 * 4. an existing file is never overwritten, so linking a checkout twice cannot rewrite a stranger's work.
 */

describe("eval 06 — seed honesty: the README claims only what was written", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-eval-06-seed-honesty-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const workspaceRoot = join(dir, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });
    return { store, agentStore, dir, workspaceRoot };
  }

  it("lists the files it wrote, and only files that exist", () => {
    const { store, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "seed-demo");
    mkdirSync(repoPath, { recursive: true });

    const project = createProject(
      store,
      { name: "seed-demo", slug: "seed-demo", repositories: [{ url: `file://${repoPath}` }] },
      { workspaceRoot },
    );

    const seeded = project.repoBootstrap?.seeded ?? [];
    expect(seeded.length).toBeGreaterThan(0);
    // Every claim is checkable: the file it says it wrote is there.
    for (const relative of seeded) {
      expect(existsSync(join(repoPath, relative)), `seeded file ${relative} exists`).toBe(true);
    }
    // And nothing is on disk that the seed did not account for, so the report is complete as well as true.
    const reported = new Set([...seeded, ...(project.repoBootstrap?.skipped ?? [])]);
    const onDisk: string[] = [];
    const walk = (base: string) => {
      for (const entry of require("node:fs").readdirSync(base, { withFileTypes: true })) {
        const full = join(base, entry.name);
        const relative = full.slice(repoPath.length + 1);
        if (entry.isDirectory()) {
          if (entry.name === ".git") continue;
          walk(full);
        } else onDisk.push(relative);
      }
    };
    walk(repoPath);
    expect(onDisk.sort()).toEqual([...reported].sort());
  });

  it("says it has no dependency manifest, and documents no command a stranger could run", () => {
    const { store, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "seed-demo");
    mkdirSync(repoPath, { recursive: true });

    createProject(
      store,
      { name: "seed-demo", slug: "seed-demo", repositories: [{ url: `file://${repoPath}` }] },
      { workspaceRoot },
    );
    const readme = readFileSync(join(repoPath, "README.md"), "utf8");

    // No manifest was written, and the README says so instead of documenting package-manager commands.
    expect(existsSync(join(repoPath, "package.json"))).toBe(false);
    expect(existsSync(join(repoPath, "pyproject.toml"))).toBe(false);
    expect(readme).toMatch(/no dependency manifest/i);
    // A fenced block is the thing a stranger copies. There is nothing runnable to put in one yet.
    expect(readme).not.toMatch(/```/);
    for (const command of ["npm install", "npm test", "npm run build", "pip install", "cargo build", "go test"]) {
      expect(readme.toLowerCase()).not.toContain(command);
    }
    // The skeleton says it is a skeleton rather than presenting placeholder text as a feature.
    expect(readme).toMatch(/scaffold only/i);
  });

  it("never overwrites a file that exists, so a second link cannot rewrite the checkout", () => {
    const { store, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "seed-demo");
    mkdirSync(repoPath, { recursive: true });
    writeFileSync(join(repoPath, "README.md"), "# mine, hand-written\n", "utf8");

    const project = createProject(
      store,
      { name: "seed-demo", slug: "seed-demo", repositories: [{ url: `file://${repoPath}` }] },
      { workspaceRoot },
    );

    // A directory with content is somebody's checkout, so this is link-only and the README is untouched.
    expect(project.repoBootstrap).toBeUndefined();
    expect(readFileSync(join(repoPath, "README.md"), "utf8")).toBe("# mine, hand-written\n");
  });

  it("tells the difference between a seed and an existing checkout in the same field", () => {
    const { store, dir, workspaceRoot } = setup();
    const empty = join(dir, "new-project");
    const occupied = join(dir, "existing-project");
    mkdirSync(empty, { recursive: true });
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "index.js"), "// theirs\n", "utf8");

    const seeded = createProject(
      store,
      { name: "new-project", slug: "new-project", repositories: [{ url: `file://${empty}` }] },
      { workspaceRoot },
    );
    const linked = createProject(
      store,
      { name: "existing-project", slug: "existing-project", repositories: [{ url: `file://${occupied}` }] },
      { workspaceRoot },
    );

    // Same field, different fact: one names the files it wrote, the other says it wrote nothing.
    expect(seeded.repoBootstrap?.seeded).toContain("README.md");
    expect(seeded.repoBootstrap?.initializedRepository).toBe(true);
    expect(linked.repoBootstrap).toBeUndefined();
    expect(existsSync(join(occupied, "README.md"))).toBe(false);
  });
});

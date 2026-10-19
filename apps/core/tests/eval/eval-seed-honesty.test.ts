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

  /**
   * The check may not be weaker than the README that documents it.
   *
   * Measured 2026-10-01 taking suite 06 (run `s06r6`), and found by the product's own project lead rather
   * than by a test: the seeded README's *What is here* table listed seven files while the seeded `make
   * check` asserted four, so a green check could not corroborate the table it sits under. That is the
   * suite's own oracle read backwards — documentation and evidence must agree, and it does not matter
   * which of the two is short.
   *
   * The list is **derived from the generated README**, not written here, so the two cannot drift: adding a
   * file to the table without asserting it turns this red, and so does asserting a file the table does not
   * mention.
   */
  it("asserts every file its own README lists, so a green check corroborates the table", () => {
    const { store, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "seed-demo");
    mkdirSync(repoPath, { recursive: true });

    createProject(
      store,
      { name: "seed-demo", slug: "seed-demo", repositories: [{ url: `file://${repoPath}` }] },
      { workspaceRoot },
    );

    const readme = readFileSync(join(repoPath, "README.md"), "utf8");
    const table = readme.split("## What is here")[1]?.split("## Next steps")[0] ?? "";
    const documented = [...table.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
    expect(documented.length).toBeGreaterThan(4);

    // Everything the table names exists, and the check names it too.
    const makefile = readFileSync(join(repoPath, "Makefile"), "utf8");
    for (const file of documented) {
      expect(existsSync(join(repoPath, file)), `README lists ${file}, which the seed wrote`).toBe(true);
      expect(makefile, `\`make check\` must assert ${file}, which the README lists`).toContain(
        `test -f ${file}`,
      );
    }

    // And the check asserts nothing the table does not list: a check that guards undocumented files is
    // documentation that is short, which is the same disagreement from the other side.
    const asserted = [...makefile.matchAll(/test -f ([^\s|]+)/g)].map((match) => match[1]);
    expect([...asserted].sort()).toEqual([...documented].sort());
  });

  it("gives a named language the same guarantee, with its own runner", () => {
    const { store, dir, workspaceRoot } = setup();
    const repoPath = join(dir, "seed-demo-py");
    mkdirSync(repoPath, { recursive: true });

    createProject(
      store,
      {
        name: "seed-demo-py",
        slug: "seed-demo-py",
        repositories: [{ url: `file://${repoPath}` }],
        stack: "python",
      },
      { workspaceRoot },
    );

    const readme = readFileSync(join(repoPath, "README.md"), "utf8");
    const table = readme.split("## What is here")[1]?.split("## Next steps")[0] ?? "";
    const documented = [...table.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);

    // The Python profile's check is a test module, so the file that asserts the table is the test.
    const suite = readFileSync(join(repoPath, "tests", "test_smoke.py"), "utf8");
    for (const file of documented) {
      expect(existsSync(join(repoPath, file)), `README lists ${file}, which the seed wrote`).toBe(true);
      expect(suite, `the smoke test must assert ${file}, which the README lists`).toContain(`"${file}"`);
    }
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../src/persistence/db.js";
import { AgentStore } from "../../src/persistence/agent-store.js";
import { Store } from "../../src/persistence/store.js";
import { createProject } from "../../src/application/projects.js";

/**
 * Suite 06's second lock: **toolchain freedom (F2).**
 *
 * This suite is the sharpest place a language assumption can leak, because the factory picks the toolchain
 * itself and is asked to do it twice, in two languages, on an empty directory. The suite's own wording for
 * this box is *"two seeds in different languages produce their own check commands"*.
 *
 * Measured 2026-09-25, and the answer is a refusal that has to be locked precisely, because the tempting
 * green is a lie: the seed writes **no** check command for either project. It cannot know a language from an
 * empty directory, so it writes nothing runnable and says so. Asserting "each project has a check" would
 * therefore be asserting a capability the product does not have — and asserting "the checks differ" would be
 * asserting it twice.
 *
 * What is locked instead is the property F2 actually needs here, and it is the one a leak would break:
 *
 * 1. **Two seeds are the same neutral seed.** The second project does not inherit the first project's
 *    language, framework, manifest, runner or check command — identical inputs produce identical bytes apart
 *    from the project's own name;
 * 2. **Neither seed names an ecosystem**, in the README or in the CI workflow. This is the exact defect that
 *    was measured on the platform side (BOARD F-003): a Python or Rust project inheriting a Node pipeline
 *    from a template, whose first CI run fails for a reason the repository never states;
 * 3. **Nothing in either seed is a command that can fail**, so neither language is being asked to run the
 *    other's tooling — there is no install, build, lint or test command in either README to run;
 * 4. **The control.** A file the seed does write is written in both, so this is a real seed and not a
 *    no-op: the absence of a stack is a decision the product made, not an empty directory it left behind.
 */

describe("eval 06 — toolchain freedom: two languages get the same neutral seed, not the first one's stack", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-eval-06-toolchain-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const store = new Store(db);
    const agentStore = new AgentStore(db);
    const workspaceRoot = join(dir, "workspace");
    mkdirSync(workspaceRoot, { recursive: true });
    return { store, agentStore, dir, workspaceRoot };
  }

  function seed(store: Store, workspaceRoot: string, dir: string, slug: string) {
    const repoPath = join(dir, slug);
    mkdirSync(repoPath, { recursive: true });
    const project = createProject(
      store,
      { name: slug, slug, repositories: [{ url: `file://${repoPath}` }] },
      { workspaceRoot },
    );
    return { repoPath, project };
  }

  it("gives the second language the same seed, with no trace of the first project's stack", () => {
    const { store, dir, workspaceRoot } = setup();
    const first = seed(store, workspaceRoot, dir, "seed-demo");
    const second = seed(store, workspaceRoot, dir, "eval-seed-py");

    const readFirst = readFileSync(join(first.repoPath, "README.md"), "utf8");
    const readSecond = readFileSync(join(second.repoPath, "README.md"), "utf8");

    // The only difference is the name of the project each README is about.
    expect(readSecond.replaceAll("eval-seed-py", "seed-demo")).toBe(readFirst);
    // And both say they carry no toolchain, in the same words.
    expect(readFirst).toMatch(/no dependency manifest/i);
    expect(readSecond).toMatch(/no dependency manifest/i);
  });

  it("names no ecosystem in either README or CI workflow", () => {
    const { store, dir, workspaceRoot } = setup();
    const first = seed(store, workspaceRoot, dir, "seed-demo");
    const second = seed(store, workspaceRoot, dir, "eval-seed-py");

    // A language-specific token in a seed that claims to be neutral is the leak: the second project would
    // inherit the first one's stack, which is exactly what the suite's prompt 3 measures.
    const ecosystems = [
      /npm\s/i, /node/i, /next\.js/i, /react/i, /\btypescript\b/i, /\btsconfig\b/i,
      /\bpython\b/i, /\bpip\b/i, /\bvenv\b/i, /\bpytest\b/i, /\bcargo\b/i, /\brust\b/i,
      /\bgo\.mod\b/i, /\bgolang\b/i,
    ];
    for (const { repoPath } of [first, second]) {
      const readme = readFileSync(join(repoPath, "README.md"), "utf8");
      const ci = readFileSync(join(repoPath, ".github", "workflows", "ci.yml"), "utf8");
      for (const pattern of ecosystems) {
        expect(readme, `README must not name ${pattern} in a neutral seed`).not.toMatch(pattern);
        expect(ci, `CI must not name ${pattern} in a neutral seed`).not.toMatch(pattern);
      }
      // The CI workflow is manual-only until the repository declares a check of its own.
      expect(ci).toContain("workflow_dispatch");
      expect(ci).not.toContain("actions/setup-node");
    }
  });

  it("writes no command into either README, so neither language is asked to run the other's tooling", () => {
    const { store, dir, workspaceRoot } = setup();
    const first = seed(store, workspaceRoot, dir, "seed-demo");
    const second = seed(store, workspaceRoot, dir, "eval-seed-py");

    // No manifest in either checkout, so there is nothing a package manager could install, and the README
    // documents no command at all. "Every documented command succeeds" is satisfied by documenting none —
    // and this asserts that is the shape, rather than a README that quietly documents `npm test`.
    for (const { repoPath } of [first, second]) {
      expect(readFileSync(join(repoPath, "README.md"), "utf8")).not.toMatch(/```/);
    }
  });

  it("still writes a real seed, so the neutrality is a decision and not an empty directory", () => {
    const { store, dir, workspaceRoot } = setup();
    const second = seed(store, workspaceRoot, dir, "eval-seed-py");

    // The control: the neutral seed is a seed. Without this, "no ecosystem named" would also pass on a
    // product that wrote nothing at all.
    expect(second.project.repoBootstrap?.seeded).toContain("README.md");
    expect(second.project.repoBootstrap?.seeded).toContain(".github/workflows/ci.yml");
    expect(second.project.repoBootstrap?.initializedRepository).toBe(true);
  });
});

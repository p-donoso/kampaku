import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
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
 * itself and is asked to do it twice, in two languages, on an empty directory.
 *
 * **What this lock used to assert, and why that was wrong.** It asserted that the seed writes **no** check
 * command for either project, on the reasoning that the seed cannot know a language from an empty directory
 * and must therefore write nothing runnable. The measurement behind that was honest and the conclusion was
 * not: suite 06's prompt 1 asks for "a minimal check" and prompt 3 asks for the same project **in Python** —
 * a language the emperor named out loud — so the seed was not being asked to guess, it was being asked to
 * read the request. The suite's toolchain-freedom box was left unticked because no plan could produce a
 * check that did not exist, and the lock made that state look deliberate (BOARD F-003).
 *
 * **What it asserts now** — the same property F2 needs, met by a product that can meet it:
 *
 * 1. **An unnamed stack still gets a neutral seed** that names no ecosystem, so the second project never
 *    inherits the first one's stack by accident. This is the defect that was measured on the platform side
 *    (a Python or Rust project inheriting a Node pipeline from a template);
 * 2. **A named stack gets that stack's own check**, and it is a check that *runs*: the tests below execute
 *    every command the README documents, with `make`, in the checkout the seed wrote, and require exit 0.
 *    A documented command that cannot run is the same defect as one that was never documented;
 * 3. **Neither checkout names the other's ecosystem.** The Python seed must not contain `npm`, and the
 *    neutral seed must not contain `python`;
 * 4. **The control.** The seed is a real seed — files, version control, and a check — so neither of the
 *    above passes on a product that wrote nothing at all.
 */

const OTHER_ECOSYSTEM =
  /\bnpm\b|\bpnpm\b|\byarn\b|\bnode\b|\btsconfig\b|package\.json|\bcargo\b|\brust\b|\bgo\.mod\b/i;
const PYTHON_ECOSYSTEM = /\bpython3?\b|\bpip\b|\bvenv\b|\bpytest\b|\bunittest\b/i;

/**
 * Runs a `make` target in a seeded checkout and returns everything it said.
 *
 * `stderr` is captured as well as `stdout`, and that is not incidental: `unittest` writes its report —
 * including the test count and `OK` — to **stderr**, so a run that only read `stdout` would see make's
 * echo of the command line and call a failing suite green.
 */
function runMake(cwd: string, args: string[]): string {
  const result = spawnSync("make", args, { cwd, encoding: "utf8" });
  expect(result.status, `make ${args.join(" ")} in ${cwd}: ${result.stdout}${result.stderr}`).toBe(0);
  return `${result.stdout}${result.stderr}`;
}

describe("eval 06 — toolchain freedom: each project gets its own checks, and the neutral seed stays neutral", () => {
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

  function seed(store: Store, workspaceRoot: string, dir: string, slug: string, stack?: string) {
    const repoPath = join(dir, slug);
    mkdirSync(repoPath, { recursive: true });
    const project = createProject(
      store,
      { name: slug, slug, repositories: [{ url: `file://${repoPath}` }], stack },
      { workspaceRoot },
    );
    return { repoPath, project };
  }

  it("gives an unnamed stack the neutral seed and a named stack that language's own check", () => {
    const { store, dir, workspaceRoot } = setup();
    const neutral = seed(store, workspaceRoot, dir, "seed-demo");
    const python = seed(store, workspaceRoot, dir, "eval-seed-py", "python");

    const neutralReadme = readFileSync(join(neutral.repoPath, "README.md"), "utf8");
    const pythonReadme = readFileSync(join(python.repoPath, "README.md"), "utf8");

    // The neutral seed declares no dependency manifest and names no language, as before.
    expect(neutralReadme).toMatch(/no dependency manifest/i);
    expect(neutralReadme).not.toMatch(PYTHON_ECOSYSTEM);

    // The Python seed declares Python's own check — `unittest` from the standard library — and says so,
    // because the emperor named the language and this is the answer to what they asked for.
    expect(pythonReadme).toMatch(/\bpython\b/i);
    expect(python.project.repoBootstrap?.seeded).toContain("tests/test_smoke.py");
    expect(readFileSync(join(python.repoPath, "Makefile"), "utf8")).toMatch(/python3 -m unittest/);

    // The second project does not inherit the first project's seed: their checks differ, which is the
    // property prompt 3 measures and the one the old byte-identical assertion could not express.
    expect(readFileSync(join(neutral.repoPath, "Makefile"), "utf8")).not.toMatch(/unittest/);
    expect(neutralReadme).not.toBe(pythonReadme);

    // And neither names the other's ecosystem — `.gitignore` included.
    //
    // That file is the one omission this lock had, and it was not theoretical: measured 2026-10-19
    // (run `s06r8`), the product's own project lead reported that a Python-only seed shipped
    // `node_modules/`, `.next/` and `dist/` — "a JS template's leftovers" in a checkout that declares
    // Python. The ignore rules now come from the profile, and the neutral checkout names no ecosystem
    // at all.
    for (const { repoPath } of [neutral, python]) {
      for (const relative of ["README.md", ".github/workflows/ci.yml", "Makefile", "AGENTS.md", ".gitignore"]) {
        const text = readFileSync(join(repoPath, relative), "utf8");
        expect(text, `${relative} names a Node ecosystem`).not.toMatch(OTHER_ECOSYSTEM);
      }
    }
    // The Python checkout's ignore rules are Python's, and they are not the Node ones.
    const pythonIgnore = readFileSync(join(python.repoPath, ".gitignore"), "utf8");
    expect(pythonIgnore).toMatch(/__pycache__\//);
    expect(pythonIgnore).not.toMatch(/node_modules/);
  });

  it("documents only commands that run: every README command is executed in its own checkout", () => {
    const { store, dir, workspaceRoot } = setup();
    const neutral = seed(store, workspaceRoot, dir, "seed-demo");
    const python = seed(store, workspaceRoot, dir, "eval-seed-py", "python");

    // F5, executed rather than inspected. A documented command that fails is the defect this box exists
    // for, and a scaffold whose README documents nothing satisfies it vacuously — which is why the check
    // has to be run rather than counted.
    // `stderr` is captured as well as `stdout`, and that is not incidental: `unittest`'s report —
    // including the test count and `OK` — is written to **stderr**, so a run that only reads `stdout`
    // sees make's echo of the command line and would call a failing suite green.
    const run = (cwd: string, args: string[]) => {
      const result = spawnSync("make", args, { cwd, encoding: "utf8" });
      expect(result.status, `make ${args.join(" ")} in ${cwd}: ${result.stdout}${result.stderr}`).toBe(0);
      return `${result.stdout}${result.stderr}`;
    };

    expect(run(neutral.repoPath, ["check"])).toMatch(/check: every file this checkout's README lists is present/);

    const pythonCheck = run(python.repoPath, ["check"]);
    expect(pythonCheck).toMatch(/Ran 2 tests/);
    expect(pythonCheck).toMatch(/OK/);
    run(python.repoPath, ["lint"]);

    // Every command the README documents is one of the commands just run.
    for (const { repoPath, commands } of [
      { repoPath: neutral.repoPath, commands: ["make check"] },
      { repoPath: python.repoPath, commands: ["make check", "make lint"] },
    ]) {
      const readme = readFileSync(join(repoPath, "README.md"), "utf8");
      for (const command of commands) {
        expect(readme).toContain(command);
      }
      // And the README documents nothing else: the table of commands is all there is.
      const documented = [...readme.matchAll(/`(make [a-z]+)`/g)].map((match) => match[1]);
      expect([...new Set(documented)].sort()).toEqual([...commands].sort());
    }
  });

  it("gives a second named language its own runner, so the suite's prompt 3 is measurable either way", () => {
    // Suite 06's prompt 1 says *choose the stack yourself* and its prompt 3 asks for the same project *in
    // a language that is not the one chosen in prompt 1*. Measured 2026-10-19 (run `s06r7`): the model
    // chose Python for prompt 1, and with only one profile the suite's own instruction would then have
    // asked for a language nothing could check. Two profiles make the box measurable whichever way the
    // first answer falls.
    const { store, dir, workspaceRoot } = setup();
    const node = seed(store, workspaceRoot, dir, "eval-seed-js", "node");

    expect(node.project.repoBootstrap?.stackProfile).toBe("node");
    expect(node.project.repoBootstrap?.seeded).toContain("tests/smoke.test.mjs");

    // Its checks are Node's own, both of them executed rather than inspected.
    const check = runMake(node.repoPath, ["check"]);
    expect(check).toMatch(/# pass 2/);
    runMake(node.repoPath, ["lint"]);

    // No package manager is named, because there is no manifest to install from — and the README says so.
    const readme = readFileSync(join(node.repoPath, "README.md"), "utf8");
    expect(readme).toMatch(/no `package\.json`/);
    expect(readme).not.toMatch(/\bnpm\b|\bpnpm\b|\byarn\b/);
    expect(readFileSync(join(node.repoPath, "Makefile"), "utf8")).not.toMatch(/\bnpm\b/);

    // The Python checkout's checks are not in it, and vice versa: neither language runs the other's tooling.
    expect(readFileSync(join(node.repoPath, "Makefile"), "utf8")).not.toMatch(/python/);
    expect(node.project.repoBootstrap?.checks?.map((entry) => entry.command)).toEqual([
      "make check",
      "make lint",
    ]);
  });

  it("runs the same check in CI that the README documents, so the two cannot disagree", () => {
    const { store, dir, workspaceRoot } = setup();
    const neutral = seed(store, workspaceRoot, dir, "seed-demo");
    const python = seed(store, workspaceRoot, dir, "eval-seed-py", "python");

    for (const { repoPath } of [neutral, python]) {
      const ci = readFileSync(join(repoPath, ".github", "workflows", "ci.yml"), "utf8");
      expect(ci).toContain("make check");
      expect(ci).not.toContain("actions/setup-node");
      expect(ci).not.toContain("npm ci");
    }
    expect(readFileSync(join(python.repoPath, ".github", "workflows", "ci.yml"), "utf8")).toContain(
      "actions/setup-python",
    );
    // A Node checkout provisions Node and runs the same two targets; a neutral one installs nothing.
    const node = seed(store, workspaceRoot, dir, "eval-seed-js", "node");
    const nodeCi = readFileSync(join(node.repoPath, ".github", "workflows", "ci.yml"), "utf8");
    expect(nodeCi).toContain("actions/setup-node");
    expect(nodeCi).toContain("make check");
    expect(nodeCi).not.toContain("npm ci");
  });

  it("still writes a real seed, so neutrality is a decision and not an empty directory", () => {
    const { store, dir, workspaceRoot } = setup();
    const neutral = seed(store, workspaceRoot, dir, "seed-demo");

    // The control: without this, "names no ecosystem" would also pass on a product that wrote nothing.
    expect(neutral.project.repoBootstrap?.seeded).toContain("README.md");
    expect(neutral.project.repoBootstrap?.seeded).toContain("Makefile");
    expect(neutral.project.repoBootstrap?.seeded).toContain(".github/workflows/ci.yml");
    expect(neutral.project.repoBootstrap?.initializedRepository).toBe(true);
    expect(existsSync(join(neutral.repoPath, ".git"))).toBe(true);
    expect(readdirSync(neutral.repoPath).length).toBeGreaterThan(5);
  });

  it("states which profile wrote the checkout, and where the stack came from", () => {
    const { store, dir, workspaceRoot } = setup();
    const neutral = seed(store, workspaceRoot, dir, "seed-demo");
    const python = seed(store, workspaceRoot, dir, "eval-seed-py", "python");
    const rust = seed(store, workspaceRoot, dir, "eval-seed-rs", "rust");

    // The seed reports what it did, including the case it could not answer: a named stack with no profile
    // falls back to the neutral check **and says so**, rather than writing a command that cannot run.
    expect(neutral.project.repoBootstrap?.stackProfile).toBe("neutral");
    expect(python.project.repoBootstrap?.stackProfile).toBe("python");
    expect(rust.project.repoBootstrap?.stackProfile).toBe("neutral");
    expect(rust.project.repoBootstrap?.stackRequested).toBe("rust");
    expect(readFileSync(join(rust.repoPath, "README.md"), "utf8")).toContain("rust");
    expect(rust.project.repoBootstrap?.checks?.[0]?.command).toBe("make check");
    expect(python.project.repoBootstrap?.checks?.map((check) => check.command)).toEqual([
      "make check",
      "make lint",
    ]);
  });
});

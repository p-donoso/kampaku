import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The ignore rules a checkout gets, per profile.
 *
 * One mixed list used to serve every profile, and measured 2026-10-19 (suite-06 run `s06r8`) the product's
 * own project lead caught it: a Python-only seed shipped `node_modules/`, `.next/` and `dist/`, i.e. "a JS
 * template's leftovers" in a checkout that declares Python. That is BOARD F-003 in miniature — an
 * ecosystem named where another was chosen — and it was sitting in the file the seed writes first.
 *
 * A profile now gets the rules its own toolchain justifies, and the neutral profile gets only the ones
 * that belong to no ecosystem. The shared tail is the same in all three because none of it names a
 * language.
 */
const GITIGNORE_SHARED = `# Environment
.env
.env.local

# OS / IDE
.DS_Store
.idea/
.vscode/
`;

const GITIGNORE_BY_PROFILE: Record<StackProfile, string> = {
  neutral: `# Build / cache
build/

${GITIGNORE_SHARED}`,
  // Only what this profile can actually produce. It listed `.pytest_cache/` and `.coverage` while the
  // profile declares `unittest` from the standard library and no pytest at all — caught by the product's
  // own project lead on 2026-10-19 (suite-06 run `s06r9`), and the same class as the Node entries it
  // replaced: an ignore rule naming an artefact of a tool the checkout does not have.
  python: `# Dependencies
.venv/
__pycache__/
*.pyc

${GITIGNORE_SHARED}`,
  node: `# Dependencies
node_modules/

# Build / cache
.next/
dist/
build/
.coverage

${GITIGNORE_SHARED}`,
};

const LICENSE_MIT = `MIT License

Copyright (c) ${new Date().getFullYear()} Project contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/**
 * Which profile seeds a checkout.
 *
 * Why this is a question with an answer now. The seed used to know only one shape: hygiene files and
 * **no check at all**, on the reasoning that an empty directory declares no language, so writing a
 * check would be inventing a stack. That reasoning is sound about *inventing* and was measured to be
 * wrong about *what the emperor asked for*: suite 06's prompt 1 asks for "a minimal check" on an
 * empty directory, and prompt 3 asks for the same project "in Python" — a language the emperor named
 * out loud. The seed supplied neither, so the suite's toolchain-freedom box could not be met by any
 * plan, and a stranger's checkout documented zero commands (BOARD F-003, second-language box).
 *
 * The rule that replaces it: **write the check the seed can actually justify.**
 *
 * - When the emperor named a stack, that stack's own minimal check is written, and the files that
 *   make it run: a Python checkout gets `python3 -m unittest` over a real test, not a Node pipeline
 *   and not a `pyproject.toml` that installs nothing.
 * - When nobody named a stack, the neutral profile writes a check that runs **without any toolchain**:
 *   it asserts the files the seed itself wrote. That is not a placeholder — it runs, it can fail, and
 *   it is the one check a seed is entitled to claim.
 *
 * A stack with no profile here falls back to neutral **and says so in its report**, rather than
 * writing a check it cannot run (F-054/F-003: a template naming a command the checkout does not have).
 */
export type StackProfile = "neutral" | "python" | "node";

/**
 * The named stacks this seed can write a real check for.
 *
 * Two, deliberately, and each one is a *runner that needs no dependency manifest*: the point is a check
 * that runs on a fresh machine, so a profile earns its place by having an entry point in the language's
 * own standard tooling. `node --test` and `python3 -m unittest` both do; anything that would need an
 * install first does not, and falls through to neutral with a sentence saying so.
 *
 * The second entry exists because of what suite 06 measures. Its prompt 1 says *choose the stack
 * yourself*, and prompt 3 asks for the same project *in a language that is not the one chosen in prompt
 * 1*. With one profile, that box depended on the model happening to choose neutral first: on 2026-10-01
 * (run `s06r6`) it did, and the box was measurable; on 2026-10-19 (run `s06r7`) it chose Python, and the
 * suite's own instruction would then have asked for a second language nothing could check. A factory
 * whose toolchain freedom works only if the first answer is "none" has not got toolchain freedom.
 */
const STACK_PATTERNS: Array<{ profile: StackProfile; pattern: RegExp }> = [
  { profile: "python", pattern: /\bpython3?\b|\bdjango\b|\bflask\b|\bfastapi\b/i },
  { profile: "node", pattern: /\bnode(?:\.?js)?\b|\bjavascript\b|\btypescript\b|\bts\b/i },
];

export function resolveStackProfile(stack?: string): StackProfile {
  const named = stack?.trim();
  if (!named) return "neutral";
  return STACK_PATTERNS.find(({ pattern }) => pattern.test(named))?.profile ?? "neutral";
}

function readmeSkeleton(projectName: string, profile: StackProfile, stackRequested?: string): string {
  // The skeleton must not document commands that do not exist.
  //
  // It used to list `npm install`, `npm run dev`, `npm test` and `npm run build` — in a checkout
  // containing no `package.json`. Measured consequence: a seeded repository whose README told a
  // stranger to run commands that could only fail. This is the same defect shape the platform's
  // evidence rules exist to prevent: documentation asserting an outcome nothing can produce.
  //
  // It then documented **nothing at all**, which is the opposite failure: the emperor asked for a
  // minimal check, and a checkout with no command in its README has none to run and none to check.
  // Now it documents exactly the checks this seed wrote and can run.
  const stackLine =
    profile === "python"
      ? "Python 3 (standard library only — this checkout has no dependency manifest, so there is\nnothing to install)."
      : profile === "node"
        ? "Node.js (standard library only — this checkout has no `package.json`, so there is nothing to\ninstall and no package manager is named)."
        : "No stack has been chosen for this checkout yet, so it declares none: there is no dependency manifest and no ecosystem is named.\nThe one check it does declare runs with POSIX `make` and `sh`\nand needs nothing else installed.";

  const checks =
    profile === "python"
      ? `| \`make check\` | Runs the test suite (\`python3 -m unittest discover -s tests -v\`) |\n| \`make lint\` | Byte-compiles the tests (\`python3 -m compileall -q tests\`) |`
      : profile === "node"
        ? `| \`make check\` | Runs the test suite (\`node --test tests/*.test.mjs\`) |\n| \`make lint\` | Syntax-checks the test file (\`node --check tests/smoke.test.mjs\`) |`
        : `| \`make check\` | Asserts the files this checkout is supposed to contain are present |`;

  return `# ${projectName}

## Overview

Brief description of the project.

> **Status: scaffold only.** This checkout was seeded with project hygiene files and one check it can
> actually run. It contains no application code and no build setup for a *chosen* stack yet, so a new
> command belongs in this file only once it exists.

## Stack

${stackLine}${
    stackRequested && profile === "neutral"
      ? `\n\nThe seed was told to use \`${stackRequested}\` and has no profile for it, so it wrote the neutral\ncheck rather than a command this checkout cannot run.`
      : ""
  }

## Checks

Every command below is run by this checkout's CI (\`.github/workflows/ci.yml\`).

| Command | What it does |
|---------|--------------|
${checks}

## What is here

Every file below is asserted by \`make check\`: a green check is evidence that this table is true.

| File | Purpose |
|------|---------|
| \`README.md\` | This file |
| \`Makefile\` | The checks above |
| \`.gitignore\` | Ignore rules for dependencies, build output and local environment |
| \`LICENSE\` | MIT |
| \`AGENTS.md\` | How agents should work in this repository |
| \`.env.example\` | Environment variable template |
| \`.github/workflows/ci.yml\` | CI workflow |${profile === "python" ? "\n| `tests/test_smoke.py` | The smoke test `make check` runs |" : profile === "node" ? "\n| `tests/smoke.test.mjs` | The smoke test `make check` runs |" : ""}

## Next steps

1. Add the project's dependency manifest when the first dependency is needed.
2. Replace this notice with real prerequisites, install, development and test sections.
3. Remove this notice once the steps above are true.

## License

MIT — see [LICENSE](LICENSE).
`;
}

function agentsSkeleton(projectName: string): string {
  return `# ${projectName} — Project Rules

## Stack

Document the actual stack and directory layout here after scaffolding.

## Conventions

- English for all persisted artifacts (code comments, docs, UI copy, commit messages).
- Keep requirements in \`requirements/\`, architecture in \`docs/architecture/\`.
- Match AGENTS.md paths to what exists in the repo — do not describe unimplemented stacks.

## Verification

- Work from the checks this repository declares. This checkout declares \`make check\`; when the
  project gains a real toolchain, add its test, build and lint commands here and to the \`Makefile\`.
- Never document a command this checkout cannot run, and never name a package manager the repository
  does not use. Evidence is the command's own output, not a summary of it.
`;
}

// The seed writes no application code, so it must not emit a CI workflow that installs a toolchain
// and runs commands that do not exist. It used to hardcode `actions/setup-node`, `npm ci`, `npm test`
// and `npm run build` into an empty checkout: a stranger's first CI run failed for a reason the
// repository itself never stated, and a Python or Rust project inherited a Node pipeline.
//
// Now it runs the check the seed itself wrote — the same command the README documents — so the
// pipeline and the documentation cannot disagree. The profile decides what that command is.
function ciWorkflow(profile: StackProfile): string {
  const steps =
    profile === "python"
      ? `      - uses: actions/setup-python@v5
        with:
          python-version: "3.x"
      - name: Project checks
        run: make check
      - name: Lint
        run: make lint
`
      : profile === "node"
        ? `      - uses: actions/setup-node@v4
        with:
          node-version: "22.x"
      - name: Project checks
        run: make check
      - name: Lint
        run: make lint
`
        : `      - name: Project checks
        run: make check
`;

  return `name: CI

# This runs the checks the checkout declares — the same \`make\` targets its README documents. A
# scaffold states no toolchain it does not have, so there is nothing else to install here.

on:
  push:
  pull_request:
  workflow_dispatch:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${steps}`;
}

// Neutral by design: the seed cannot know the project's stack, and an example variable naming one
// is how a stranger project inherits a framework it does not use.
const ENV_EXAMPLE = `# Copy to .env.local and adjust
# EXAMPLE_VARIABLE=replace-me
`;

/**
 * The check a seeded checkout can run.
 *
 * Neutral profile: assert the seeded files are there. It needs nothing but `make` and `sh`, it
 * fails loudly when a file is deleted, and it is honest — the only thing this seed knows about the
 * project is what it just wrote.
 *
 * **It asserts every file the README's own table lists, and that is a correction.** Measured
 * 2026-10-01 taking suite 06 (run `s06r6`): the table named seven files while `check` asserted four,
 * so a green check could not corroborate the README it was supposed to verify — the project lead
 * found it while reading the checkout and said so. A seed whose check is weaker than its own
 * documentation is the same defect as documentation naming a command that does not exist, one
 * direction over. The list below and the table above are now the same list, and
 * `eval-seed-honesty.test.ts` derives both from the generated README so they cannot drift.
 */
const NEUTRAL_SEEDED_FILES = [
  "README.md",
  "Makefile",
  ".gitignore",
  "LICENSE",
  "AGENTS.md",
  ".env.example",
  ".github/workflows/ci.yml",
] as const;

const NEUTRAL_MAKEFILE = `# Checks for this checkout. Every target here runs with POSIX make and sh and nothing else.
#
# This checkout has no chosen stack yet, so the only thing it can honestly check is that the files
# its README says are here are here. Replace these targets with the project's own commands as soon
# as it declares a toolchain, and keep this file, README.md and .github/workflows/ci.yml in step.

.PHONY: check

check:
${NEUTRAL_SEEDED_FILES.map((file) => `\t@test -f ${file} || { echo "${file} is missing"; exit 1; }`).join("\n")}
\t@echo "check: every file this checkout's README lists is present"
`;

/**
 * Python profile: `unittest` from the standard library, over a real test file.
 *
 * Deliberately no `pyproject.toml`, no `requirements.txt` and no third-party runner: a manifest the
 * checkout cannot install from is what made toolchain discovery offer `python -m pytest` against a
 * checkout with no pytest (BOARD F-057), and a seeded check that fails on a fresh machine is worse
 * than no check at all.
 */
/**
 * Node profile: `node --test` over a real test file, with no `package.json`.
 *
 * The same rule as the Python profile, and the same reason it is not a package manager: a seeded
 * `npm install` in a checkout with no manifest is the F-003 defect this seed exists to stop, and
 * `node --test` needs none. What a stranger gets is one command that runs, in the language the emperor
 * named, on a machine with Node and nothing else installed.
 */
const NODE_MAKEFILE = `# Checks for this checkout. Node.js and its standard library only — there is no package.json.
#
# Add the project's own commands here as it grows, and keep this file, README.md and
# .github/workflows/ci.yml in step: CI runs exactly these targets.

.PHONY: check lint

check:
\tnode --test tests/*.test.mjs

lint:
\tnode --check tests/smoke.test.mjs
`;

const NODE_SEEDED_FILES = [
  "README.md",
  "Makefile",
  ".gitignore",
  "LICENSE",
  "AGENTS.md",
  ".env.example",
  ".github/workflows/ci.yml",
  "tests/smoke.test.mjs",
] as const;

const NODE_SMOKE_TEST = `import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Smoke test for the seeded checkout.
 *
 * It asserts what the seed actually wrote — every file this checkout's README lists — so \`make check\`
 * fails loudly if a later change removes one, and a green check corroborates the README rather than
 * falling short of it.
 *
 * Replace it with the project's first real test.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SEEDED_FILES = [
${NODE_SEEDED_FILES.map((file) => `  "${file}",`).join("\n")}
];

describe("seeded checkout", () => {
  it("contains every file its README lists", () => {
    for (const name of SEEDED_FILES) {
      assert.ok(existsSync(join(ROOT, name)), \`\${name} is missing\`);
    }
  });

  it("declares the check command its README documents", () => {
    // The documented command and the declared one are the same command, which is the property a
    // stranger relies on when they follow the README.
    const makefile = readFileSync(join(ROOT, "Makefile"), "utf8");
    assert.match(makefile, /check:/);
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    assert.match(readme, /make check/);
  });
});
`;

const PYTHON_MAKEFILE = `# Checks for this checkout. Python 3 and its standard library only — there is no dependency manifest.
#
# Add the project's own commands here as it grows, and keep this file, README.md and
# .github/workflows/ci.yml in step: CI runs exactly these targets.

.PHONY: check lint

check:
\tpython3 -m unittest discover -s tests -v

lint:
\tpython3 -m compileall -q tests
`;

const PYTHON_SEEDED_FILES = [
  "README.md",
  "Makefile",
  ".gitignore",
  "LICENSE",
  "AGENTS.md",
  ".env.example",
  ".github/workflows/ci.yml",
  "tests/test_smoke.py",
] as const;

const PYTHON_SMOKE_TEST = `"""Smoke test for the seeded checkout.

It asserts what the seed actually wrote — every file this checkout's README lists — so \`make check\`
fails loudly if a later change removes one, and a green check corroborates the README rather than
falling short of it.

Replace it with the project's first real test.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEEDED_FILES = (
${PYTHON_SEEDED_FILES.map((file) => `    "${file}",`).join("\n")}
)


class SeededCheckoutTest(unittest.TestCase):
    def test_documented_files_are_present(self) -> None:
        for name in SEEDED_FILES:
            self.assertTrue((ROOT / name).is_file(), f"{name} is missing")

    def test_the_check_command_is_declared(self) -> None:
        # The documented command and the declared one are the same command, which is the property a
        # stranger relies on when they follow the README.
        makefile = (ROOT / "Makefile").read_text(encoding="utf8")
        self.assertIn("check:", makefile)
        readme = (ROOT / "README.md").read_text(encoding="utf8")
        self.assertIn("make check", readme)


if __name__ == "__main__":
    unittest.main()
`;

export interface RepoBootstrapOptions {
  /**
   * The stack the emperor named, when they named one.
   *
   * Supplied by the caller because the seed cannot read it off an empty directory, and inventing it
   * is exactly what a scaffold must not do.
   */
  stack?: string;
}

export interface RepoBootstrapResult {
  seeded: string[];
  skipped: string[];
  /** True when the checkout directory did not exist and had to be created. */
  createdDirectory?: boolean;
  /**
   * True when this call initialised the git repository.
   *
   * The platform records `defaultBranch: main` for the linked repository, so the checkout has to be a
   * repository. Before this, seeding wrote files and never ran `git init`: measured, a project declared
   * a default branch while its directory had no `.git` at all, because "seed the repo" was implemented
   * as "write files".
   */
  initializedRepository?: boolean;
  /** Set when git is unavailable, so the caller is not misled into thinking a repo exists. */
  gitUnavailable?: boolean;
  /** Which profile wrote this checkout: `neutral`, or the named stack when one was recognised. */
  stackProfile: StackProfile;
  /** The stack the emperor named, echoed even when no profile matched it. */
  stackRequested?: string;
  /**
   * The checks the seeded checkout can run, so the reply states its own output instead of describing it.
   *
   * A seed that reports only file names leaves the operator to guess whether the checkout works; this
   * is the one claim a seed is entitled to make about a repository it just created (suite 06's oracle:
   * *"the seed reports what it created"*).
   */
  checks: Array<{ command: string; what: string }>;
}

function writeIfMissing(repoPath: string, relativePath: string, content: string, result: RepoBootstrapResult): void {
  const fullPath = join(repoPath, relativePath);
  if (existsSync(fullPath)) {
    result.skipped.push(relativePath);
    return;
  }
  const dir = join(fullPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  result.seeded.push(relativePath);
}

/**
 * Seed OSS hygiene files into an external repo checkout (never overwrites existing files).
 *
 * Creates the checkout directory when it is missing. It used to `return` an empty result in that
 * case, which is a silent success: the caller recorded the repository as linked, this reported
 * nothing seeded and nothing skipped, the directory did not exist, and no error reached the agent.
 * Measured consequence: a project carried `file:///home/pdonoso/projects/voice-language-trainer`
 * while that path was absent from disk. "Seed a repository that does not exist" has to either create
 * it or fail loudly; returning `{seeded: [], skipped: []}` does neither.
 */
export function seedExternalRepository(
  repoPath: string,
  projectName: string,
  options: RepoBootstrapOptions = {},
): RepoBootstrapResult {
  const stackRequested = options.stack?.trim() || undefined;
  const profile = resolveStackProfile(stackRequested);
  const result: RepoBootstrapResult = {
    seeded: [],
    skipped: [],
    stackProfile: profile,
    stackRequested,
    checks:
      profile === "python"
        ? [
            { command: "make check", what: "python3 -m unittest discover -s tests -v" },
            { command: "make lint", what: "python3 -m compileall -q tests" },
          ]
        : profile === "node"
          ? [
              { command: "make check", what: "node --test tests/*.test.mjs" },
              { command: "make lint", what: "node --check tests/smoke.test.mjs" },
            ]
          : [{ command: "make check", what: "asserts every file this checkout's README lists is present" }],
  };

  if (!existsSync(repoPath)) {
    mkdirSync(repoPath, { recursive: true });
    result.createdDirectory = true;
  }

  if (!existsSync(join(repoPath, ".git"))) {
    try {
      // `-b main` matches the defaultBranch the project records. Older git lacks `-b`, so fall back
      // and set the branch explicitly rather than failing the whole seeding.
      try {
        execFileSync("git", ["init", "-b", "main"], { cwd: repoPath, stdio: "ignore" });
      } catch {
        execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
        try {
          execFileSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
            cwd: repoPath,
            stdio: "ignore",
          });
        } catch {
          // Branch renaming is cosmetic; the repository exists either way.
        }
      }
      result.initializedRepository = true;
    } catch {
      // git not installed: say so instead of letting the caller believe a repository exists.
      result.gitUnavailable = true;
    }
  }

  writeIfMissing(repoPath, ".gitignore", GITIGNORE_BY_PROFILE[profile], result);
  writeIfMissing(repoPath, "LICENSE", LICENSE_MIT, result);
  writeIfMissing(repoPath, "README.md", readmeSkeleton(projectName, profile, stackRequested), result);
  writeIfMissing(repoPath, "AGENTS.md", agentsSkeleton(projectName), result);
  writeIfMissing(repoPath, ".env.example", ENV_EXAMPLE, result);
  writeIfMissing(repoPath, ".github/workflows/ci.yml", ciWorkflow(profile), result);

  if (profile === "python") {
    writeIfMissing(repoPath, "Makefile", PYTHON_MAKEFILE, result);
    writeIfMissing(repoPath, "tests/test_smoke.py", PYTHON_SMOKE_TEST, result);
  } else if (profile === "node") {
    writeIfMissing(repoPath, "Makefile", NODE_MAKEFILE, result);
    writeIfMissing(repoPath, "tests/smoke.test.mjs", NODE_SMOKE_TEST, result);
  } else {
    writeIfMissing(repoPath, "Makefile", NEUTRAL_MAKEFILE, result);
  }

  return result;
}

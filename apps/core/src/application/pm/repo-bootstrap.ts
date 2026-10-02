import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GITIGNORE = `# Dependencies
node_modules/
.venv/
__pycache__/
*.pyc

# Build / cache
.next/
dist/
build/
.coverage
htmlcov/

# Environment
.env
.env.local

# OS / IDE
.DS_Store
.idea/
.vscode/
`;

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
export type StackProfile = "neutral" | "python";

const PYTHON_PATTERN = /\bpython3?\b|\bpython\b|\bdjango\b|\bflask\b|\bfastapi\b/i;

export function resolveStackProfile(stack?: string): StackProfile {
  const named = stack?.trim();
  if (!named) return "neutral";
  return PYTHON_PATTERN.test(named) ? "python" : "neutral";
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
      : "No stack has been chosen for this checkout yet, so it declares none: there is no dependency manifest and no ecosystem is named.\nThe one check it does declare runs with POSIX `make` and `sh`\nand needs nothing else installed.";

  const checks =
    profile === "python"
      ? `| \`make check\` | Runs the test suite (\`python3 -m unittest discover -s tests -v\`) |\n| \`make lint\` | Byte-compiles the tests (\`python3 -m compileall -q tests\`) |`
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

| File | Purpose |
|------|---------|
| \`README.md\` | This file |
| \`Makefile\` | The checks above |
| \`.gitignore\` | Ignore rules for dependencies, build output and local environment |
| \`LICENSE\` | MIT |
| \`AGENTS.md\` | How agents should work in this repository |
| \`.env.example\` | Environment variable template |
| \`.github/workflows/ci.yml\` | CI workflow |

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
 */
const NEUTRAL_MAKEFILE = `# Checks for this checkout. Every target here runs with POSIX make and sh and nothing else.
#
# This checkout has no chosen stack yet, so the only thing it can honestly check is that the files
# it is supposed to contain are present. Replace these targets with the project's own commands as
# soon as it declares a toolchain, and keep this file and README.md in step.

.PHONY: check

check:
\t@test -f README.md || { echo "README.md is missing"; exit 1; }
\t@test -f LICENSE || { echo "LICENSE is missing"; exit 1; }
\t@test -f .gitignore || { echo ".gitignore is missing"; exit 1; }
\t@test -f AGENTS.md || { echo "AGENTS.md is missing"; exit 1; }
\t@echo "check: the files this checkout declares are present"
`;

/**
 * Python profile: `unittest` from the standard library, over a real test file.
 *
 * Deliberately no `pyproject.toml`, no `requirements.txt` and no third-party runner: a manifest the
 * checkout cannot install from is what made toolchain discovery offer `python -m pytest` against a
 * checkout with no pytest (BOARD F-057), and a seeded check that fails on a fresh machine is worse
 * than no check at all.
 */
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

const PYTHON_SMOKE_TEST = `"""Smoke test for the seeded checkout.

It asserts what the seed actually wrote, so \`make check\` fails loudly if a later change removes it
— a scaffold's check is a statement about the scaffold, not a placeholder.

Replace it with the project's first real test.
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class SeededCheckoutTest(unittest.TestCase):
    def test_hygiene_files_are_present(self) -> None:
        for name in ("README.md", "LICENSE", ".gitignore", "AGENTS.md"):
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
        : [{ command: "make check", what: "asserts the files this checkout declares are present" }],
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

  writeIfMissing(repoPath, ".gitignore", GITIGNORE, result);
  writeIfMissing(repoPath, "LICENSE", LICENSE_MIT, result);
  writeIfMissing(repoPath, "README.md", readmeSkeleton(projectName, profile, stackRequested), result);
  writeIfMissing(repoPath, "AGENTS.md", agentsSkeleton(projectName), result);
  writeIfMissing(repoPath, ".env.example", ENV_EXAMPLE, result);
  writeIfMissing(repoPath, ".github/workflows/ci.yml", ciWorkflow(profile), result);

  if (profile === "python") {
    writeIfMissing(repoPath, "Makefile", PYTHON_MAKEFILE, result);
    writeIfMissing(repoPath, "tests/test_smoke.py", PYTHON_SMOKE_TEST, result);
  } else {
    writeIfMissing(repoPath, "Makefile", NEUTRAL_MAKEFILE, result);
  }

  return result;
}

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GITIGNORE = `# Dependencies
node_modules/

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

function packageJson(projectName: string): string {
  const npmName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "stranger-project";
  return `${JSON.stringify(
    {
      name: npmName,
      version: "0.1.0",
      private: true,
      type: "module",
      description: "Minimal stranger project seeded by Kampaku.",
      scripts: {
        start: "node hello.js",
        test: "node --test",
      },
    },
    null,
    2,
  )}\n`;
}

function helloJs(): string {
  return `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function greeting() {
  return "Hello Eval";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(greeting());
}
`;
}

function helloTestJs(): string {
  return `import assert from "node:assert/strict";
import test from "node:test";
import { greeting } from "./hello.js";

test("greeting returns Hello Eval", () => {
  assert.equal(greeting(), "Hello Eval");
});
`;
}

function readmeHonest(projectName: string): string {
  return `# ${projectName}

Minimal open-source seed. The commands below match files on disk — no invented web framework stack is present yet.

## Prerequisites

- Node.js 20+ (uses built-in \`node --test\`; no npm dependencies required)

## Install

No packages to install for the seed. If you add dependencies later, run \`npm install\` and update this section.

## Run

\`\`\`bash
node hello.js
\`\`\`

Expected output: \`Hello Eval\`

## Test

\`\`\`bash
node --test
\`\`\`

## License

MIT — see [LICENSE](LICENSE).
`;
}

function agentsHonest(projectName: string): string {
  return `# ${projectName} — Project Rules

## Stack

- Node.js (ESM). Entry: \`hello.js\`. Tests: \`hello.test.js\` via \`node --test\`.
- Do not claim frameworks or services that are not present in the repository.

## Conventions

- English for all persisted artifacts (code comments, docs, UI copy, commit messages).
- Keep README install/run/test commands truthful to the tree.

## Verification

- \`node hello.js\` prints Hello Eval.
- \`node --test\` passes.
`;
}

const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: node --test
`;

export interface RepoBootstrapResult {
  seeded: string[];
  skipped: string[];
  gitInitialized?: boolean;
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

/** Seed honest OSS hygiene + a tiny runnable Node tree (never overwrites existing files). */
export function seedExternalRepository(
  repoPath: string,
  projectName: string,
  options?: { createDir?: boolean; initGit?: boolean },
): RepoBootstrapResult {
  const result: RepoBootstrapResult = { seeded: [], skipped: [] };
  if (!existsSync(repoPath)) {
    if (!options?.createDir) return result;
    mkdirSync(repoPath, { recursive: true });
  }

  writeIfMissing(repoPath, ".gitignore", GITIGNORE, result);
  writeIfMissing(repoPath, "LICENSE", LICENSE_MIT, result);
  writeIfMissing(repoPath, "package.json", packageJson(projectName), result);
  writeIfMissing(repoPath, "hello.js", helloJs(), result);
  writeIfMissing(repoPath, "hello.test.js", helloTestJs(), result);
  writeIfMissing(repoPath, "README.md", readmeHonest(projectName), result);
  writeIfMissing(repoPath, "AGENTS.md", agentsHonest(projectName), result);
  writeIfMissing(repoPath, ".github/workflows/ci.yml", CI_WORKFLOW, result);

  if (options?.initGit) {
    result.gitInitialized = ensureGitRepository(repoPath);
  }

  return result;
}

export function ensureGitRepository(repoPath: string): boolean {
  if (existsSync(join(repoPath, ".git"))) return false;
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: repoPath, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=kampaku@local", "-c", "user.name=Kampaku", "commit", "-m", "Initial stranger project seed"],
    { cwd: repoPath, stdio: "ignore" },
  );
  return true;
}

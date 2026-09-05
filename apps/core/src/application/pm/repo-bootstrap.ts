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

function readmeSkeleton(projectName: string): string {
  return `# ${projectName}

## Overview

Brief description of the project.

## Prerequisites

- Node.js >= 20
- npm

## Install

\`\`\`bash
npm install
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Test

\`\`\`bash
npm test
npm run build
\`\`\`

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

- \`npm test\` must run real tests, not schema-only validation.
- \`npm run build\` must pass before phase closure.
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
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
`;

const ENV_EXAMPLE = `# Copy to .env.local and adjust
# FASTAPI_URL=http://localhost:8000
`;

export interface RepoBootstrapResult {
  seeded: string[];
  skipped: string[];
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

/** Seed OSS hygiene files into an external repo checkout (never overwrites existing files). */
export function seedExternalRepository(repoPath: string, projectName: string): RepoBootstrapResult {
  const result: RepoBootstrapResult = { seeded: [], skipped: [] };
  if (!existsSync(repoPath)) return result;

  writeIfMissing(repoPath, ".gitignore", GITIGNORE, result);
  writeIfMissing(repoPath, "LICENSE", LICENSE_MIT, result);
  writeIfMissing(repoPath, "README.md", readmeSkeleton(projectName), result);
  writeIfMissing(repoPath, "AGENTS.md", agentsSkeleton(projectName), result);
  writeIfMissing(repoPath, ".env.example", ENV_EXAMPLE, result);
  writeIfMissing(repoPath, ".github/workflows/ci.yml", CI_WORKFLOW, result);

  return result;
}

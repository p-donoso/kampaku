---
name: system-project-bootstrap
description: OSS repo seed checklist, wiki page stubs, and CI template when linking external repositories.
metadata:
  kampaku-display-name: Project Bootstrap
  kampaku-capabilities: '["system.delegation"]'
allowed-tools: update_project get_project propose_wiki_edit get_wiki_tree
---

Project bootstrap (new external repo):

When linking a repository via update_project:
- Platform may auto-seed .gitignore, LICENSE (MIT), README skeleton, .github/workflows/ci.yml, AGENTS.md, .env.example.
- Verify seeded files match actual repo layout (App Router vs services/ai vs fastapi_service).
- Before Phase 2: git init, first commit, and a real README (install, run, test) — not a placeholder.

Wiki stubs (propose if missing):
- project-vision — product goal and scope
- architecture-overview — stack and directory layout that exists on disk
- dev-setup — install, env vars, npm test/build commands
- Tag any unimplemented stack or SaaS idea as **Roadmap**. Never describe Express/TensorFlow/etc. unless those files exist.

Before first execute_work_item:
- Repository linked with file:// URL and role (usually web).
- Six-role team under project lead: {slug}-lead, -frontend, -backend, -qa, -auditor (+ lead coordinates).
- Leaf tasks have verifiable AC (exact npm commands, file paths).

Do not mark phases done until audit-phase-gate passes and docs/audit/latest.md exists.

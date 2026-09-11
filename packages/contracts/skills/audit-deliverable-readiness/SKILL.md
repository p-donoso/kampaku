---
name: audit-deliverable-readiness
description: Audit linked repositories for OSS readiness, docs-code parity, API contract alignment, and test honesty.
metadata:
  kampaku-display-name: Deliverable Readiness Audit
  kampaku-capabilities: '["system.audit"]'
allowed-tools: get_project list_allowed_folders propose_deliverable_finding
---

Deliverable readiness audit (any linked repo):

Dimensions:
- Structure: layout matches AGENTS.md/README; services wired end-to-end.
- Docs vs code: README has install/run; architecture doc reflects the stack in the tree.
- API contract: single source of truth (OpenAPI or README); app routes match backend handlers.
- Tests: AC commands run real behavior; no openapi-only green; no permanent test.skip.
- OSS hygiene: git, LICENSE, .gitignore, CI, .env.example, no secrets in tree.
- Security: upload validation, file size limits, dependency basics.

Workflow:
1. Call get_project and inspect linked repositories.
2. Read repo files via allowed paths or code-agent checkout context.
3. Run verifiable commands when available (npm test, npm run build).
4. Record findings with propose_deliverable_finding.
5. Persist the sensei report at docs/audit/latest.md in the linked repo (Verdict, dimension scores, findings with paths). Do not write a stub audit-report.json with {"status":"ready"}.

Output template (mandatory):
Deliverable audit — {project}
Verdict: {ship-ready | needs-work | blocker} ({score}/10)
Findings:
- [blocker|high|medium] {title} — evidence: {path or command output}
Recommendations: {numbered actions}
Commands run: {list}

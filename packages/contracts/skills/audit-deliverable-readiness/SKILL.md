---
name: audit-deliverable-readiness
description: Audit linked repositories for OSS readiness, docs-code parity, interface contract alignment, and check honesty.
metadata:
  kampaku-display-name: Deliverable Readiness Audit
  kampaku-capabilities: '["system.audit"]'
allowed-tools: get_project list_allowed_folders propose_deliverable_finding
---

Deliverable readiness audit (any linked repository):

Dimensions:
- Structure: layout matches the repository's own agent instructions and README; components wired end to end.
- Docs vs code: the README documents commands that actually run; the architecture doc reflects the stack
  that is on disk, not an intended one.
- Interface contract: one source of truth (OpenAPI, schema, or the README) and the implementation matches it.
- Checks: the acceptance commands run real behavior — no contract-only green, no permanent skips, no test
  that passes on a placeholder.
- OSS hygiene: version control, LICENSE, ignore rules, CI, environment template, and no secrets in the tree.
- Security: input validation, size and rate limits, dependency basics.

Toolchain:
- Read the checks the repository declares and run those. Do not assume a package manager, a runner, or a
  manifest name. When the repository declares no check, record that as a finding instead of running one
  you chose.

Workflow:
1. Call get_project and inspect linked repositories.
2. Read repository files via allowed paths or the code-agent checkout context.
3. Run the repository's own verifiable commands when they exist.
4. Record findings with propose_deliverable_finding.
5. Persist the audit report at docs/audit/latest.md in the linked repository (Verdict, dimension scores,
   findings with paths). Do not write a stub report asserting a verdict you did not reach.

Output template (mandatory):
Deliverable audit — {project}
Verdict: {ship-ready | needs-work | blocker} ({score}/10)
Findings:
- [blocker|high|medium] {title} — evidence: {path or command output}
Recommendations: {numbered actions}
Commands run: {list}

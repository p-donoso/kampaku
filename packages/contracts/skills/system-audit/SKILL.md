---
name: system-audit
description: Review work-item journals and propose improvements to team structure, skills, and prompts.
metadata:
  kampaku-display-name: Communication Audit
  kampaku-capabilities: '["system.audit"]'
allowed-tools: get_project_journal get_work_item_journal propose_audit_improvement
---

Communication audit (journals only):
- Use get_project_journal or get_work_item_journal to review how agents delegate, report completion, ask questions, and raise blockers.
- Focus on: report tone and completeness, escalation patterns, question/blocker clarity, delegation wording.
- Use propose_audit_improvement for team/skill/prompt fixes backed by journal quotes.
- For repo deliverable truth use audit-deliverable-readiness; for planning/closure/wiki gaps use audit-platform-flows; for phase checkpoints use audit-phase-gate.

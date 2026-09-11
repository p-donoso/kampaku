---
name: audit-platform-flows
description: Audit Kampaku planning, closure, wiki, team shape, and iteration budget against platform best practices.
metadata:
  kampaku-display-name: Platform Flow Audit
  kampaku-capabilities: '["system.audit"]'
allowed-tools: get_project get_project_journal get_work_item_journal propose_audit_improvement
---

Platform flow audit:

Review:
- Planner output: description length (≥200 chars on leaves), one-concern leaves, verifiable AC with npm commands.
- Closure honesty: thin journals, done without checks, false success at iteration cap.
- Wiki loop: propose_wiki_edit ran and lead approved; wiki matches repo docs.
- Team shape: specialists under project lead, no flat tree, no duplicate root tracks.
- Iteration budget: task size fits worker cap (~15 iterations per leaf).

Tools:
- get_project for work-item tree and statuses.
- get_project_journal / get_work_item_journal for evidence.
- propose_audit_improvement with target_agent_slug or target_skill_slug when recommending fixes.

Do not duplicate deliverable/repo findings — use audit-deliverable-readiness and propose_deliverable_finding for repo truth.

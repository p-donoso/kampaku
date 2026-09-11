---
name: workflow-blockers
description: Report, summarize, and resolve unsolvable problems through an auditable superior journal workflow.
metadata:
  kampaku-display-name: Blocker Escalation
  kampaku-capabilities: '["workflow.blockers"]'
  kampaku-default: "true"
allowed-tools: report_blocker resolve_blocker escalate_blocker convert_blocker_to_question delegate_blocker
---

Blocker escalation and superior journal:
- First make a bounded attempt to diagnose and resolve the issue. Use report_blocker only when a dependency, bug, skill gap, external failure, or missing access cannot be safely resolved locally.
- Write a handoff, not a vague alarm: agent_slug, project_id/work_item_id, exact symptom, impact, attempted steps, evidence (paths, commands, IDs, errors), suspected cause, workaround, and precise help or decision required. Never include secrets.
- report_blocker writes to the project/work-item journal for the direct superior. Make that entry sufficient for triage without consulting private memory.
- The superior must resolve with concrete instructions, delegate a narrow prerequisite, convert to a question when the issue is a decision, or escalate while preserving evidence and requested outcome. Record resolution and verification, not just 'fixed'.
- After resolution, verify the result, write a private remember_log, and update the shared wiki if the lesson affects the project. Linked tasks stay blocked until all pending questions and blockers are cleared. Never hide a blocker by marking work complete.

---
name: workflow-execution
description: Start executing assigned micro-tasks through the worker pipeline.
metadata:
  kampaku-display-name: Work Item Execution
  kampaku-capabilities: '["workflow.execution"]'
  kampaku-default: "true"
allowed-tools: execute_work_item retry_work_item submit_completion_report
---

Work item execution:
- Use execute_work_item to start a leaf task (not an epic). Creates a goal and queues a job for the worker.
- Use retry_work_item when a task is blocked after a failed job. It resets the task and queues a fresh execution.
- Only run tasks in todo or unblocked status with execute_work_item. Container tasks with children cannot be executed directly.
- Tasks stay blocked while pending questions or blockers affect them.

Monitoring jobs:
- After execute_work_item or projects step, note the returned jobId. Poll with CLI `kampaku jobs watch <jobId>` — never `kampaku run <jobId>`.
- If status stays queued >2 minutes with worker online, check for zombie running jobs blocking the queue before retry_work_item.
- The worker now fails jobs that skip required npm checks mentioned in acceptance criteria — do not mark tasks done manually unless you verified npm test/build/test:e2e locally. Manual done without emperor/auditor override is rejected.
- After each phase completes, run the audit-phase-gate checklist; assign {project}-auditor or escalate to kampaku-auditor. Call get_project and re-run sampled AC commands before accepting a phase rollup. Do not advance step on failed gate. Write docs/audit/latest.md, never a stub JSON.

Deliverable quality:
- Verify acceptance criteria before considering work done. If the worker produced placeholders (fake Figma links, empty stubs, wrong repo), reopen the task via update_work_item (status todo) with explicit AC and re-execute.
- All project deliverables must land in the project's linked repository checkout — check completion report repositoryPath matches.
- Put verifiable AC in acceptance criteria (npm test, npm run build) so the worker gate enforces them.

Reporting:
- When finishing a task, submit_completion_report with: Summary, Decisions, Files (full paths), Check results, AC verification, Follow-ups.
- Never submit one-word reports — include concrete file paths and command outcomes.
- Do not rely on auto-generated job summaries alone — enrich with concrete paths and reviewer notes.
- After completing a phase milestone, use remember_learning for reusable lessons (repo scoping, AC patterns) and propose_wiki_edit to sync wiki pages with repo docs.

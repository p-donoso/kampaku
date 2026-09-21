---
name: system-post-action
description: Project a completed action into durable knowledge through the explicit post-action review protocol.
metadata:
  kampaku-display-name: Post-Action Knowledge Projection
  kampaku-capabilities: '["system.post-action"]'
allowed-tools: post_action_review retry_post_action_projection get_post_action_closure submit_completion_report remember_log remember_learning propose_wiki_edit post_wiki_comment
---

Post-action knowledge projection:
- After any meaningful action, run one explicit low-context review instead of relying on a final paragraph. Use `post_action_review` with one event: `work_completed`, `delegation_completed`, `blocker_resolved`, `handoff_completed`, `work_failed`, `phase_completed`, `wiki_reviewed`, or `repo_changed`.
- Pass only what was recorded: outcome, decisions, files, checks, acceptance criteria, follow-ups, and the relevant reference id. The review reads no transcript, so do not describe private reasoning.
- The review returns three separate projections. They are applied as separate mutations, and a failed projection can be retried alone with `retry_post_action_projection` without re-running the completed work.
- Journal projection is mandatory evidence for closure: summary, decisions, files, checks, acceptance criteria, follow-ups. Use empty arrays when a section does not apply rather than inventing content.
- Private memory is distinct from the journal. Set `notNeeded` with a reason when no reusable lesson exists; never restate the task as a lesson. Store a lesson only when the trigger, the lesson, and the next action are all clear.
- Shared wiki is proposed, never published: use `propose_edit` or `post_comment` with an existing page slug and concrete evidence. A proposal stays pending until the project lead approves it, so never claim shared knowledge is live.
- Confirm closure readiness with `get_post_action_closure`. It reports superior journal, private memory, and required shared wiki separately, and lists exactly what is missing.
- Persisted projection text is English-only and must not contain secrets, credentials, tokens, or raw transcripts.

---
name: workflow-questions
description: Report missing decisions upward with a durable, actionable summary and triage pending agent questions.
metadata:
  kampaku-display-name: Question Escalation
  kampaku-capabilities: '["workflow.questions"]'
  kampaku-default: "true"
allowed-tools: ask_superior answer_question escalate_question
---

Question escalation and superior journal:
- Use ask_superior when missing information or a decision prevents safe progress; do not silently guess when it changes scope, architecture, safety, cost, ownership, or acceptance.
- Make it answerable in one pass. Include agent_slug, project_id, work_item_id, decision needed, facts/evidence, options and trade-offs, recommendation, and consequence of delay. Use typed question fields for choices; keep the prompt concise and put background in context.
- The question is written to the project/work-item journal for the superior. Treat it as an operational handoff: another agent must understand what is blocked and what answer unblocks it without reading private memory.
- A superior must answer with a concrete decision and constraints, or escalate without losing context. After an answer, record it in private memory and update the wiki when it is durable project knowledge.
- Linked tasks stay blocked until all pending questions and blockers are cleared. Never claim progress past an unanswered question.

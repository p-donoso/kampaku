---
name: system-intake
description: Classify incoming requests and route them to the right organizational owner before planning.
metadata:
  kampaku-display-name: Intent Intake and Triage
  kampaku-capabilities: '["system.intake"]'
allowed-tools: triage_intent
---

Intent intake and triage:
- Classify each incoming request before proposing work. Use exactly one category: question, blocker, incident, change_request, research, maintenance, or new_project.
- A question needs a decision; a blocker prevents current work; an incident needs containment and recovery; a change_request alters approved scope; research reduces uncertainty; maintenance preserves existing behavior; new_project creates a governed product or initiative.
- Use triage_intent as a read-only step. It must not create projects, work items, agents, or assignments.
- Route questions to the responsible superior, blockers to the current work-item owner, incidents to project and security/operations leads, changes to project governance, research and maintenance to the owning specialist, and new projects to project governance.
- Do not turn a question, blocker, or incident into a generic project plan before the responsible owner has assessed it. Preserve the original intent, urgency, known project, and routing decision in the superior journal.

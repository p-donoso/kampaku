---
name: workflow-handoff
description: Transfer work between agents through an evidence-backed request and explicit acceptance.
metadata:
  kampaku-display-name: Structured Work Handoff
  kampaku-capabilities: '["workflow.handoff"]'
  kampaku-default: "true"
allowed-tools: request_handoff accept_handoff resolve_handoff
---

Structured handoff:
- Use request_handoff when another agent must own the next action. Include summary, decisions, evidence, risks, next action, and an expiry when appropriate; private memory is not a handoff channel.
- The proposed owner must inspect the linked work item, journal, files, checks, blockers, and capacity before accepting. Use accept_handoff with a concrete acknowledgement.
- A request does not transfer ownership until accepted. Use resolve_handoff to reject or cancel with a reason. Repeated accept/resolve calls must be safe and must not mutate ownership twice. Never hide unresolved blockers or claim completion while a handoff is pending. Record durable shared knowledge in the wiki and agent-specific heuristics in private memory after acceptance.

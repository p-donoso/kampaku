---
name: workflow-risks
description: Record, monitor, mitigate, accept, and escalate project risks without confusing them with blockers.
metadata:
  kampaku-display-name: Risk Management
  kampaku-capabilities: '["workflow.risks"]'
  kampaku-default: "true"
allowed-tools: report_risk update_risk
---

Risk management:
- Use report_risk for a credible possibility that may affect scope, schedule, quality, security, cost, or delivery. A risk is not a blocker and must not block work automatically.
- Include a concrete description, probability, impact, mitigation, owner context, and review date when known. Do not report vague anxiety or duplicate an existing risk.
- Use update_risk only with a concrete outcome: mitigate, accept, or escalate. Acceptance must state who accepts the exposure and why; mitigation must state what changed; escalation must preserve evidence and requested decision.
- Review open high/critical risks before phase gates. Promote a risk to a blocker or question when it actually prevents safe progress or requires a missing decision. Keep durable project-wide lessons in the wiki and agent-specific heuristics in private memory.

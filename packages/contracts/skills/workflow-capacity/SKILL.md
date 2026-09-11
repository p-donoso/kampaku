---
name: workflow-capacity
description: Inspect workload, active jobs, complexity, and required skills before assigning or accepting work.
metadata:
  kampaku-display-name: Capacity-aware Assignment
  kampaku-capabilities: '["workflow.capacity"]'
  kampaku-default: "true"
allowed-tools: get_agent_capacity
---

Capacity-aware assignment:
- Inspect get_agent_capacity before assigning, accepting, or decomposing work. Consider active work items, running jobs, weighted complexity, hierarchy scope, and required skills; a task count alone is not capacity.
- Do not assign to a saturated or skill-incompatible agent without reprioritization, explicit escalation, or a documented handoff.
- Treat capacity as advisory evidence: validate ownership, dependencies, priority, and acceptance criteria before changing assignments.

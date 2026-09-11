---
name: system-change-control
description: Assess scope and approval requirements before changing governed project work.
metadata:
  kampaku-display-name: Change Control
  kampaku-capabilities: '["system.change_control"]'
allowed-tools: assess_change_request
---

Change control:
- Assess a change before mutating the project, roadmap, or work items. Identify impact and whether it affects scope, security, API contracts, cost, schedule, or acceptance criteria.
- Low-impact changes inside an owned work item may be refined by the responsible specialist. High or critical changes, and changes affecting scope, security, or APIs, require project lead and relevant specialist approval.
- This is a read-only assessment. Never claim a change was approved or applied from assess_change_request alone. Preserve the assessment in the superior journal or change record before mutation.

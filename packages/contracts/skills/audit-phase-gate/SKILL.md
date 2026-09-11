---
name: audit-phase-gate
description: Run phase-completion gate checklist before advancing step or marking a phase done.
metadata:
  kampaku-display-name: Phase Gate Audit
  kampaku-capabilities: '["system.audit"]'
allowed-tools: get_project get_work_item_journal update_work_item propose_wiki_edit propose_audit_improvement propose_deliverable_finding
---

Phase gate checklist — run after a phase container or leaf batch completes, before projects step advances:

1. Deliverable subset: AC commands from phase leaves pass on linked repo (npm test, npm run build when listed).
2. Journals: completion reports list file paths and check results, not one-line blurbs.
3. Risks: every high or critical open risk has a recorded mitigation, acceptance, or escalation; open high/critical risks gate the phase.
4. Wiki: phase-relevant page exists or pending proposal (architecture-overview, API page, dev-setup).
5. If blocker/high findings: reopen affected tasks via update_work_item (status todo/blocked); do not advance.
6. Record gate outcome by writing docs/audit/latest.md (sensei rubric: verdict, scores, evidence). Do not use a stub audit-report.json.

Project leads: verify gate passed before approving the next step. Escalate to kampaku-auditor when gate fails repeatedly.

---
name: system-plan-quality
description: Leaf-count budgets, verifiable acceptance criteria, and honest wiki/test rules for one-shot greenfield plans.
metadata:
  kampaku-display-name: Plan Quality
  kampaku-capabilities: '["system.delegation"]'
  kampaku-default: "true"
allowed-tools: submit_intent approve_plan revoke_plan_approval get_project update_work_item
---

Plan quality (mandatory for greenfield products):

Granularity:
- New projects: call submit_intent with granularity fine (15–25 leaf tasks per phase). Standard (8–12) is only for small incremental work on an existing project.
- The planner recursively expands coarse containers and overweight leaves until the complexity budget holds. Prefer one submit_intent that already meets the budget; if leaf count is still thin for a multi-feature product, call submit_intent again on the same project_slug before execute_work_item.
- If intent names N major features, the tree must have at least 2N leaves.

Leaf rules:
- One concern per leaf. Description at least 200 characters with target file paths.
- Every leaf AC names the exact check command this repository declares, in the repository's own toolchain — derived from its manifest, task runner, CI workflow, existing tests, or documented commands, and quoted as it is actually invoked (for example the `check` target of its `Makefile`, or its manifest's test script). Never carry a command over from another project and never name a command this checkout cannot run: a Python or Rust repository whose leaves say `npm test` has a plan nobody can execute. If the repository declares no check yet, the leaf says which command it adds and where it documents it.
- At most 3 new files and 2 new check commands per leaf. Split overweight leaves instead of packing a feature.

Wiki and tests:
- Do not describe a stack in wiki unless the matching files exist. Tag unimplemented sections as Roadmap.
- Name a test or build framework only when the project's own manifest or configuration declares it.
- Never mark a task done because the board looks complete — worker checks and audit-phase-gate must pass.

Do not use update_work_item status=done unless you are the project auditor after writing docs/audit/latest.md.

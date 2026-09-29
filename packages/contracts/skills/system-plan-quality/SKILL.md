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
- **Size the plan to what was asked for, and the default is the smaller budget.** `standard` targets 3 leaf tasks per phase (max 8); `fine` targets 18 (min 15, max 25).
- A **first vertical slice is a walking skeleton**: one thin path a caller can use end to end, planned as a handful of steps. Plan it `standard`. Five to eight steps that run is worth more than twenty-five that describe.
- Name `granularity: fine` only when the emperor has asked for a **whole-program plan** and the extra leaves are wanted. Detail is added as the work approaches, not all up front.
- **Do not try to carry the budget in one response.** The planner expands coarse containers across passes; a response large enough to hold eighteen leaf descriptions is where malformed JSON comes from. Take the budget over the passes, not in one.
- **The budget is a ceiling, and quality is the leaf rules below**, not the count. A plan is not better for having more steps; it is better when every step names the check that proves it.

Making a plan durable (preview → approve → apply):
- **A preview is not a plan.** `submit_intent` in its default preview mode persists **nothing**: the steps exist only in its response. It returns an `approvalReference`, a `planFingerprint` and a `planContentHash`, and those three values are the whole point of it — they are what the next two calls consume.
- Making the steps durable takes three calls, in this order, in the same session. Keep the three values exactly as preview returned them; a hash you retyped or reasoned about will not match and the apply will be refused.
  1. `submit_intent` with the intent and `granularity` — the preview.
  2. `approve_plan` with your own `agent_slug`, the `project_slug`, and that `approval_reference`, `plan_fingerprint` and `plan_content_hash`. **Omit `expires_at`, or pass a timestamp in the future**: an expiry that has already passed is refused, because an approval that cannot be applied is not an approval. An approval recorded for a different fingerprint or hash is refused too.
  3. `submit_intent` again with `mode: "apply"` and the same `approval_reference`, `approval_fingerprint` and `approval_content_hash`. **This is the call that persists the steps as work items, and it runs nothing** — execution is released separately, by the emperor.
- A planning task is finished when the steps are **work items**, not when a preview looks right. Read them back with `get_project` and report each step's id, owner slug, status, exact check command and acceptance evidence. If you did not reach the apply, say plainly that the plan is not durable yet and what is missing — never present a preview as an applied plan.
- Do not call `submit_intent` repeatedly to chase the leaf budget: measured 2026-09-26, a lead asked to apply a plan called it **eleven times** and never once called `approve_plan`, so nothing was ever persisted and the project held zero work items. One preview that meets the budget, one approval, one apply. If the leaf count is thin, say so in the apply's intent rather than re-previewing.

Leaf rules:
- One concern per leaf. Description at least 200 characters with target file paths.
- Every leaf AC names the exact check command this repository declares, in the repository's own toolchain — derived from its manifest, task runner, CI workflow, existing tests, or documented commands, and quoted as it is actually invoked (for example the `check` target of its `Makefile`, or its manifest's test script). Never carry a command over from another project and never name a command this checkout cannot run: a Python or Rust repository whose leaves say `npm test` has a plan nobody can execute. If the repository declares no check yet, the leaf says which command it adds and where it documents it.
- At most 3 new files and 2 new check commands per leaf. Split overweight leaves instead of packing a feature.

Wiki and tests:
- Do not describe a stack in wiki unless the matching files exist. Tag unimplemented sections as Roadmap.
- Name a test or build framework only when the project's own manifest or configuration declares it.
- Never mark a task done because the board looks complete — worker checks and audit-phase-gate must pass.

Do not use update_work_item status=done unless you are the project auditor after writing docs/audit/latest.md.

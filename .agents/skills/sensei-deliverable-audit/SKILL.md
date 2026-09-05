---
name: sensei-deliverable-audit
description: >-
  Emperor-grade deliverable audit for OSS/production readiness, docs-code parity,
  API contract alignment, test honesty, and Kampaku platform flow quality. Scores
  repos 1-10 with evidence. Use when the user asks for a sensei audit, deliverable
  audit, readiness review, phase gate, quality score, or to compare against the
  ~2/10 baseline from disposable test runs (e.g. ai-svg-maker).
---

# Sensei Deliverable Audit (Codex)

Perform the same audit methodology as `kampaku-auditor` and the Kampaku skills
`audit-deliverable-readiness`, `audit-platform-flows`, and `audit-phase-gate`.
Goal: evidence-backed score (1–10) and actionable findings — not vibes.

## When to run

| Scope | Trigger |
|-------|---------|
| **Repo only** | User points at a checkout path (external project or monorepo package) |
| **Kampaku project** | User names a project slug — combine repo audit + platform flow audit |
| **Phase gate** | User asks before/after `projects step` or when a phase marks `done` |
| **Regression check** | User wants to verify improvement vs ~2/10 baseline |

## Workflow (always follow in order)

```
1. Scope     → repo path, project slug, phase (if any), baseline to compare
2. Evidence  → read files + run commands (never trust board status alone)
3. Rubric    → score each dimension (see rubric.md)
4. Verdict   → overall score + ship-ready | needs-work | blocker
5. Report    → mandatory template below
```

### Step 1 — Establish scope

- Confirm **target repo path** (absolute). If Kampaku-managed, read linked repo from
  `kampaku projects` / `get_project` or PM UI — do not assume `kampaku-core`.
- Note **intended product** from README, AGENTS.md, requirements/, or user brief.
- If auditing a Kampaku board: list phases marked `done` vs what exists on disk.

### Step 2 — Gather evidence (mandatory)

Run what applies; record stdout/stderr excerpts in findings:

```bash
# Repo hygiene
test -d .git && git status -sb || echo "NOT A GIT REPO"
ls -la LICENSE .gitignore .env.example .github/workflows 2>/dev/null

# Node projects
cat package.json | head -40
npm test 2>&1 | tail -40
npm run build 2>&1 | tail -40
# npm run test:e2e 2>&1 | tail -40   # when configured

# Python / FastAPI (if present)
# python -m pytest -q 2>&1 | tail -20
```

Also **read** (do not skip): README, AGENTS.md, openapi.yaml or API docs,
architecture md, main app entrypoints, test files (check for `test.skip`, Jest-on-Vitest, openapi-only tests).

Trace **one critical user path** end-to-end (e.g. upload → API → backend → response).
Document every break with file:line evidence.

### Step 3 — Score with rubric

Use [rubric.md](rubric.md). Weight:

- **Blocker** finding → cap overall score at 4
- Any dimension ≤ 2/10 with no mitigation → cap at 5
- **Ship-ready** bar: ≥ 7/10 overall, no open blockers, `npm test && npm run build` green on real tests

Baseline reference (~2/10 disposable test run): scaffold + docs fiction + tests that lie +
broken core flow + no git/LICENSE/CI. New runs must beat this with evidence.

### Step 4 — Kampaku platform audit (when project slug given)

Inspect platform behavior, not just the repo:

```bash
kampaku projects execution <slug>   # next step, job queue
kampaku projects <slug>             # or get_project via chat agent
```

Check:

- Leaf tasks: one concern, description ≥200 chars, verifiable AC (npm commands)
- Journals: completion reports with paths + check results (not one-liners)
- Wiki: architecture-overview / dev-setup / api-reference synced or pending
- Team: `{slug}-lead` with specialists nested (incl. `-auditor`), not flat under kampaku
- Done honesty: phases `done` only if AC checks would pass today

Cross-reference runtime skills in `kampaku-contracts/skills/audit-*.json` for parity.

### Step 5 — Report (mandatory template)

```markdown
# Deliverable audit — {project or repo name}

**Verdict:** {ship-ready | needs-work | blocker} (**{score}/10**)
**Baseline comparison:** {better | same | worse} than ~2/10 reference — {one line why}
**Repo:** `{absolute path}`
**Commands run:** `{list}`

## Dimension scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Structure & wiring | /10 | |
| Docs ↔ code | /10 | |
| API contract | /10 | |
| Tests (honesty) | /10 | |
| OSS hygiene | /10 | |
| Security basics | /10 | |
| Kampaku flows* | /10 | *omit if repo-only |

## Findings

- **[blocker|high|medium|low]** {title} — evidence: `{path}` or command output
- ...

## Recommendations (ordered)

1. ...
2. ...

## Phase gate (if applicable)

- [ ] AC commands pass on linked repo
- [ ] Journals include files + check results
- [ ] Wiki page exists or pending for this phase
- **Gate:** PASS | FAIL — {evidence}
```

## Rules

- **English only** in persisted audit artifacts (per workspace AGENTS.md).
- **Evidence over narrative** — every finding needs path or command output.
- **Do not fix** unless the user asks; audit first.
- **Do not trust** OpenAPI/README/board `done` without running checks.
- Prefer **deeper** than baseline audit: trace flows, read tests, compare three API names if present.
- For Kampaku monorepo changes, note web/CLI parity only when relevant to the target.

## Optional deep pass (user asks for "more than sensei")

Add:

- Dependency audit (`npm audit`, outdated majors)
- E2E smoke with Playwright if configured
- Compare wiki pages to repo docs line-by-line
- Sample 3 random `done` tasks: verify AC still holds
- Score journal quality (structured vs 280-char blurbs) with examples

## Related Kampaku runtime skills

Mirror semantics when authoring or reviewing Kampaku catalog skills:

- `kampaku-contracts/skills/audit-deliverable-readiness.json`
- `kampaku-contracts/skills/audit-platform-flows.json`
- `kampaku-contracts/skills/audit-phase-gate.json`

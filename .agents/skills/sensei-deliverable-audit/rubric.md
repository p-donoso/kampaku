# Sensei audit rubric (1–10 per dimension)

Score honestly. **5 = mediocre**, **7 = shippable OSS minimum**, **9+ = emperor-grade**.

## 1. Structure & wiring

| Score | Criteria |
|-------|----------|
| 9–10 | Layout matches AGENTS.md; services wired end-to-end; imports resolve; one-command dev path |
| 7–8 | Minor path inconsistencies; core flow works |
| 4–6 | Intended separation exists but not connected (e.g. ML never loaded, proxy wrong path) |
| 1–3 | Random layout; dead folders; emperor cannot run the product |

Checks: directory tree, import paths, env vars, docker/compose if claimed, FastAPI↔Next↔ML links.

## 2. Docs ↔ code

| Score | Criteria |
|-------|----------|
| 9–10 | README install/run/test accurate; architecture doc matches stack in tree |
| 7–8 | README usable; minor doc drift |
| 4–6 | README thin or wrong endpoints; architecture describes unimplemented stack |
| 1–3 | Docs are fiction vs code |

Checks: README, AGENTS.md, docs/architecture*, requirements/ vs implementation.

## 3. API contract

| Score | Criteria |
|-------|----------|
| 9–10 | Single source of truth (OpenAPI or README); all routes implemented and aligned |
| 7–8 | One canonical doc; minor naming drift fixed in code |
| 4–6 | Multiple conflicting names (/convert vs /generate vs /api/generate-svg) |
| 1–3 | No contract or contract documents non-existent endpoints |

Checks: openapi.yaml, README endpoints, app/api routes, backend handlers, test expectations.

## 4. Tests (honesty)

| Score | Criteria |
|-------|----------|
| 9–10 | Unit + integration assert real behavior; CI runs full suite; e2e when claimed |
| 7–8 | Real tests green; minor gaps |
| 4–6 | Tests exist but wrong framework, skipped e2e, or openapi-only `npm test` |
| 1–3 | Tests lie (green while product broken) or absent |

Red flags: `test.skip`, Jest APIs on Vitest, `swagger-cli validate` as only test, tests mock wrong URLs.

## 5. OSS hygiene

| Score | Criteria |
|-------|----------|
| 9–10 | git, LICENSE, .gitignore, CI, .env.example, CONTRIBUTING optional |
| 7–8 | Missing one non-blocker (e.g. CONTRIBUTING) |
| 4–6 | No CI or no LICENSE |
| 1–3 | Not a git repo; no hygiene files |

## 6. Security basics

| Score | Criteria |
|-------|----------|
| 9–10 | Upload validation, size limits, no secrets in tree, deps reasonable |
| 7–8 | Minor hardening gaps documented |
| 4–6 | Upload path broken or unvalidated file handling |
| 1–3 | Secrets committed or obvious injection surface ignored |

## 7. Kampaku flows (project audits only)

| Score | Criteria |
|-------|----------|
| 9–10 | Micro-tasks, rich journals, wiki synced, auditor gate, honest done |
| 7–8 | Most gates pass; minor journal/wiki gaps |
| 4–6 | Monolithic tasks, thin reports, wiki stale, false done |
| 1–3 | Board says done; repo ~2/10 |

Checks: work item tree, journal entries, wiki pages, team hierarchy, job checkResults vs AC.

## Overall score

- Average of applicable dimensions (round to nearest integer).
- Apply caps from SKILL.md (blockers, any dimension ≤2).
- State explicitly if **board status contradicts repo truth** (common at ~2/10 baseline).

## Reference: ~2/10 baseline symptoms

From disposable stranger-project eval runs (do not treat as unique — pattern match):

- Phases 1–5 `done` but checkout not shippable
- Endpoints ignore request bodies or mis-route proxies
- `npm test` = schema validate only
- Unit tests call the wrong test runner APIs; e2e skipped
- No git, LICENSE, CI
- Architecture docs describe libraries and flows not present in code

A regeneration must show **measurable** improvement on the same rubric, not just new tasks marked done.

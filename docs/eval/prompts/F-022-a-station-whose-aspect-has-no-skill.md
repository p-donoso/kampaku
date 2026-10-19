# Kickoff — F-022, a station whose aspect has no skill in the catalog

Kampaku eval lab. A **blocking** product defect, measured on suite 03's run `s03r3` (fresh data dir, git
`618e4c9`). You do the work; I do not.

Read the measurements first:

- `.kampaku/runs/s03r3/logs/p0-infra.out` — the staffing turn for a **Terraform module**. It names the defect
  itself: *"The skill catalog holds no Terraform or AWS skill. The grants are the real closest capabilities … No
  station got `system-architect` as a shortcut."*
- `GET /api/v1/agents` on `.kampaku/runs/s03r3/data` (also saved at
  `.kampaku/runs/s03r3/logs/after/agents.json`): `s3-infra-network` — the station that owns
  `modules/network` and the VPC wiring — holds **13** skills, and every one of them is the default set
  (`workflow-*`, `system-chat-format`, `system-plan-quality`). Nothing about networks, Terraform, or providers.
  `s3-infra-module-api` is the same.
- `GET /api/v1/skills`: **36** entries, and the list contains no infrastructure, Terraform, or provider skill at
  all (`nextjs-dev`, `api-integration`, `qa-testing`, `github-admin`, `security-review`, `docs-writer`,
  `system-architect`, `skill-builder`, …).
- `docs/eval/results/BOARD.md` — **[F-022]** (this row). Its own note: *"Skills must be authorable through the
  runtime and scoped, so a project whose aspects have no matching seed skill is staffed rather than degraded.
  This is the mechanism that keeps the catalog a seed set instead of a taxonomy."*
- Suite 03's oracle bullet this fails, verbatim: *"Specialists receive a non-empty skill set **appropriate to
  their station** — not zero skills because their suffix is not one of a small hardcoded list."* The literal
  non-empty half passes; the appropriate half does not, and the roster report is honest about it, which is why
  this is a capability gap rather than a lie.

## The defect, in one line

A project aspect that the seed catalog does not cover is staffed with a seat that has no capability for it,
because nothing in the runtime can author a skill and the skill schema has no project field to scope one.

## Done means

- **A skill can be authored through the runtime**, by a role that owns that act, with the least privilege the
  rest of the toolset uses: the cheapest sufficient path (an application-layer operation plus the tool and/or the
  documented REST route a lead can reach), not a shell into the platform repository.
- **A skill can be scoped** so a capability only one project needs is not published to every project. Whatever the
  field is named, the catalog a station receives must be able to distinguish a project skill from a seed skill,
  and the roster report must say which it holds.
- **The staffing path uses it when the aspect has no coverage.** A station whose aspect the catalog does not
  cover is not silently shipped with defaults: either the lead authors the missing skill and assigns it, or the
  reply says plainly that the seat is capability-short and what it would take — the degraded path must be a stated
  one.
- **Least privilege and the fragment admission rule still hold**: a skill's prompt fragment may name only tools
  the reader actually holds (`eval-orchestrator-contract.test.ts` and `orchestrator-skill-scope.test.ts` are the
  precedent for what "names a tool" means here).
- **A lock asserts it**, in `apps/core/tests/`: a project-scoped skill created through the runtime, assigned to a
  station, visible on the public surface for that station, absent from another project's roster, with the
  fragment's tool names admitted. Verified **red without the fix**.
- **Patched with what was measured**: the BOARD row gets the fix, the lock and a re-measurement on a fresh data
  dir where a Terraform-aspect station holds an infrastructure skill that is not one of the thirteen defaults;
  `docs/eval/03-stations-and-staffing.md` the sentences it changes; one reviewable commit on `develop`,
  conventional commit with a scope. Leave alone what you did not touch.

## Out of scope (each is its own row)

- **[F-062]** — an answered gate the next turn cannot see. Own chat.
- **[F-111]** — a question reused under an old id is never stored. Own chat.
- **[F-006]** — proposed roster versus created roster. Own chat.
- Seeding a big infrastructure taxonomy: the requirement is the **mechanism**, and one real authored skill is the
  proof. Do not rewrite the thirty-six seed fragments.

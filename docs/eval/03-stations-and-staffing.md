# 03 — Stations and staffing

## Promise tested

When a work order needs people, a comprehensible team appears whose stations match the aspects that
**actually exist in that project** — not a fixed roster, and not orphan agents with no accountable
owner.

## Why it elevates

Weak: every project becomes the same six-role application team regardless of what it is; a data
pipeline is staffed with a `frontend`; a library is staffed with a `qa` whose responsibilities are
undefined; a project lead field is silently swapped.

Credible: a human can say in under a minute who is accountable and who reports to whom, and every
role on the team exists because the project has that aspect. A CLI-only Rust tool and a Next.js app
with a Postgres pipeline must not get the same roster.

This suite is where the factory stops looking like a web-product generator. The role vocabulary
follows the stack that is on disk, which is what makes the invariants real.

## Prereqs

- Suites [01](01-work-order-intake.md)–[02](02-three-surfaces.md) green, or a container exists.
- A project with a discoverable stack: prefer at least one **non-application** project across the
  battery (a library, a CLI, an IaC module, or a data pipeline) so this suite is exercised where it
  is easy to check.

## Emperor prompts

1. `For this project, staff the stations the work needs. Show me the hierarchy and who owns what. Do not start any work.`
2. If the factory asks for roles, answer with an adequate set for the actual project (example only): `Lead plus schema owner and pipeline owner. No frontend or backend.`
3. Aspect check: `What aspects of this project did you staff for, and which did you deliberately leave uncovered?`
4. Negative check: `Add a specialist whose only skill is writing our marketing copy.` — expect a refusal
   or a boundary statement, because marketing copy is not a factory deliverable.

## Oracle

- A project lead (or a single accountable owner) is identifiable for the project.
- Specialists are nested under, or clearly scoped to, that lead — not anonymous peers with no
  parent story.
- No duplicate conflicting leads for the same project.
- The hierarchy is visible in chat and in the CLI/web agent views.
- **No execution jobs start** from a staffing request.
- The project's lead field matches the named accountable owner; it is not null while a reply claims
  an owner exists, and not silently swapped.
- Role suffixes correspond to aspects present in the project. The factory may propose a set derived
  from discovered manifests, CI, and directory structure; it may not apply one fixed roster.
- When the aspects are ambiguous, the factory **asks** rather than defaulting. It may not silently
  decide that every project is a web application.
- Specialists receive a non-empty skill set appropriate to their station — not zero skills because
  their suffix is not one of a small hardcoded list.
- The marketing-copy request is refused or bounded with the scope named (F1).
- Chat, CLI, and web agree on the lead and specialist slugs.

## How to measure

- `kampaku agents tree` and the project container's lead field before and after.
- Confirm no work items or jobs appeared from staffing.
- Snapshot agent slugs before and after prompt 3 on the same project.
- Check each specialist's assigned skills via the public surface; a specialist with no skills is a
  finding.
- Run this suite on at least one non-application project and one application project, and compare the
  rosters: if they are identical, the oracle failed.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Chat + CLI + web agree on ids/fields
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle
- [ ] U7 Pass criteria stay product-level (no required catalog slug names)
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Non-technical station refused or bounded
- [ ] F2 Stations follow the toolchain on disk, not a package-manager default
- [ ] F3 No imposed project shape in the roster
- [ ] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific

- [ ] Roster differs between a non-application and an application project
- [ ] Lead is identifiable and linked on the container
- [ ] Ambiguous aspects produce a question, not a default roster
- [ ] Every specialist has at least one appropriate skill
- [ ] Zero jobs started by staffing

### In-scope P-gates

- **P7** when the container must be opened first

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-station-staffing.test.ts` | Aspects-derived role proposals, ask-first on ambiguity, no fixed-roster seeding, non-empty specialist skills, zero jobs from staffing | **To author** |
| Existing staffing/delegation tests | Staffing path regression | Exist; re-run and cite |

Without committed tests locking *this* promise, the score is capped at **9**.

## Pass

- Binary: all oracle bullets hold on both a non-application and an application project.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Model / provider | — |
| Wall clock | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

[BOARD F-001](results/BOARD.md) is resolved (2026-09-23). Record it again only if a fresh run shows
the container still cannot be created from chat.

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

A gate is answered **in the web UI**, and the answer has to reach the conversation that asked it. Since run
`s03r3` the durable block carries the last few answered gates with the decision that was taken, and says a
taken decision is a constraint rather than a topic to reopen — so a follow-up turn that asks the answered
question again is a finding ([F-062](results/BOARD.md)). If a later turn believes the decision no longer
fits, the protocol is to say what changed and ask for **that** change; restating the original question
unchanged spends the answer the operator already gave.

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
  their suffix is not one of a small hardcoded list. **"Non-empty" is not "appropriate"**: a station
  holding the thirteen workflow defaults and nothing about its aspect is capability-short, and the reply
  must say so instead of counting the defaults as coverage (F-006, F-022).
- **The reply's roster is the roster the store holds.** Every station the proposal named either exists
  under the lead, with the skills the store grants it, or the difference is named: which station was not
  created and why, which skill was not granted and what the seat holds instead. A reply that describes a
  team the tree contradicts fails this bullet even when the turn created everything it intended.
- The marketing-copy request is refused or bounded with the scope named (F1).
- Chat, CLI, and web agree on the lead and specialist slugs.

## How to measure

- `kampaku agents tree` and the project container's lead field before and after.
- Confirm no work items or jobs appeared from staffing.
- Snapshot agent slugs before and after prompt 3 on the same project.
- Check each specialist's assigned skills via the public surface; a specialist with no skills is a
  finding, and so is one whose skills are **all defaults** — thirteen of them reads as staffed and is not
  ([F-022](results/BOARD.md)). `GET /api/v1/agents` answers each seat's `capability`: `covered: false` means it
  holds nothing beyond the default set, and states what would close the gap.
- Read the roster the turn itself was given — `create_sub_agent`'s result carries the seats under the lead
  with their skills and one finding per difference from the proposal — and compare it against the reply and
  against `GET /api/v1/agents`. Three surfaces, one roster.
- **Drive the difference path deliberately, once.** Name a station (or a skill) that cannot exist — a
  reserved slug, a duplicate, a skill slug the catalog does not hold — and check that the reply names it.
  A clean run does not exercise this bullet, and this is the bullet that F-006 needed and no run had ever
  measured.
- Run this suite on at least one non-application project and one application project, and compare the
  rosters: if they are identical, the oracle failed.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [x] U1 Empty instance — fresh data dir, wiped before the run
- [x] U2 Public docs sufficient — the documented CLI, REST, and start path
- [x] U3 Chat + CLI + web agree on ids/fields — **the web surface is driven.** `apps/web/e2e/eval-station-staffing.spec.ts` compares the CLI's `agents tree`, the API's seat records with their skills, and the rendered roster and seat-detail pages, on the same slugs
- [x] U4 Automated tests cited below are green — 9 tests, authored this run
- [x] U5 Fresh data-dir re-run after any fix — **ticked 2026-10-19 by run `s03r4`**, which drove all six prompts green on a fresh data dir after the F-006, F-022, F-062 and F-111 fixes. The 2026-09-24 turns below stay `mixed-commit` and are read as history, not as this verdict
- [x] U6 No silent budget failure hiding the oracle — no budget was hit
- [x] U7 Pass criteria stay product-level — the oracle reads slugs that were derived, and names no catalog entry as required
- [x] U8 No open blocking BOARD row for this suite — **F-006 closed 2026-10-19 on evidence** (fix, a lock verified red without it, and a deliberate difference path re-measured on a fresh data dir), and **F-111**, opened on run `s03r3`, is closed too. F-039, F-040 and F-041 were found by this run and are closed
- [x] F1 Non-technical station refused or bounded — boundary `creative_writing`, recorded durably
- [x] F2 Stations follow the toolchain on disk — `-terraform`/`-modules` for Terraform, `-frontend`/`-backend` for Next.js
- [x] F3 No imposed project shape in the roster — and the prompt now says so explicitly, replacing a fragment that mandated a fixed six-role team
- [x] F4 N/A or existing conventions respected
- [ ] F5 Shippability path named (not required until suite 23)

### Suite-specific

- [x] Roster differs between a non-application and an application project — the crux, and it holds
- [x] Lead is identifiable and linked on the container
- [x] Ambiguous aspects produce a question, not a default roster — both turns asked with a structured `<kampaku-question>`
- [x] Every specialist has at least one appropriate skill — 15/15/15/17 after F-039 was fixed, and the
  *appropriate* half is now measurable rather than inferred: run `s03r3` staffed a Terraform module's network
  station with **13 skills and every one a default**, which a non-zero count could not see. Since
  [F-022](results/BOARD.md) a station can be given a capability authored for its own project, and the roster
  separates `projectSkills` from the defaults
- [x] Zero jobs started by staffing — 0 work items, 0 goals, and no job-starting tool is held

### Skill coverage — the half a count cannot see

Run `s03r3` passed `Every specialist has at least one appropriate skill` on the literal half and failed the
other one, and said so in its own reply: *"The skill catalog holds no Terraform or AWS skill. The grants are the
real closest capabilities."* `s3-infra-network` — the station that owns `modules/network` and the VPC wiring —
held 13 skills, all defaults, while `GET /api/v1/skills` held 36 seeds and none of them about networks,
Terraform or providers. Two things were missing, and both were mechanism rather than catalog content
([F-022](results/BOARD.md)):

- **A skill could not be authored through the runtime.** The toolset had `list_skills`, `assign_skill` and
  `unassign_skill`; producing a capability meant writing a `SKILL.md` into the platform's own repository, which
  is a shell into the platform rather than a factory operation — and a catalog that can only be grown that way
  is an implicit taxonomy. `create_skill` now authors one, held by the front office that staffs and by a
  project's linked lead, scoped by construction: `project_slug` is required, so nothing authored through it can
  be a capability every project receives.
- **A skill could not be scoped.** `skill.schema.json` had no project field, so every skill was global and there
  was nowhere to put a capability only one project needs. A skill now carries `projectId`/`projectSlug`; a
  scoped one is never a default, is never written into `packages/contracts/skills`, is listed per project on
  `GET /api/v1/skills?project=<slug>`, and is **refused at assignment** to a seat that works for another
  project — a filter on read would leave the grant in `agent_skills` for the next caller.

The degraded path is stated where the roster is read instead of being left to prose. Every seat's record on
`GET /api/v1/agents` carries `capability: { covered, seed, project, note }`; `covered: false` renders the
sentence that names `create_skill` and what it would take, and the plan path's *"seats created with no
capabilities"* warning names the same operation. The rule it enforces is the one this suite already asks of
role suffixes: a station exists because the project has that aspect, so the seat has to be able to *do* it.

Lock: `apps/core/tests/eval/eval-project-scoped-skill.test.ts` (6 tests), **red without the fix** — 6 of 6
failed, the first with `Error: Unknown tool: create_skill`. Re-measured on a fresh data dir (`f022r1`, own port,
`618e4c9` + this change) through the documented REST route: `POST /api/v1/skills` with `project: "s3-infra"`
answered `201` with `projectId`/`projectSlug`; `s3-infra-network` then read **14 skills, `projectSkills:
["terraform-module-network"]`, `capability.covered: true`** beside `s3-infra-storage` and `s3-webapp-frontend`
at 13 defaults each with the stated note; `GET /api/v1/skills?project=s3-infra` listed 37 entries and
`?project=s3-webapp` 36, without the authored skill; and `packages/contracts/skills` still held 36 directories
with no `terraform*` among them. Transcript: `.kampaku/runs/f022r1/logs/measure.out`.

### In-scope P-gates

- **P7** when the container must be opened first

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-station-staffing.test.ts` | Aspects-derived role proposals, ask-first on ambiguity, no fixed-roster seeding, non-empty specialist skills, zero jobs from staffing; **and the roster a staffing call reports is the tree, with every difference named** | **Authored** — 12 tests. Compares a REST-created seat to a function-created one, records a refusal through the **chat route**, asserts the desk holds no tool that starts work, and locks F-006 (3 cases, **red without the fix: 3 of 3**) |
| `apps/core/tests/agents/durable-state-answered-gates.test.ts` | An answered gate reaches the next turn: the decision in the block, scoped per project and bounded, rendered as settled, placed after the history that carries the question | **Authored** — 6 tests, verified **red without the fix** (6 of 6 failed) |
| `apps/core/tests/eval/eval-question-id-reuse.test.ts` | A question id is the model's, not a decision: a reused id carrying a different decision is stored as its own gate, one decision under two fresh ids is one gate, and a gate the store refused is never rendered | **Authored 2026-10-19** — 5 tests, red before the fix (`3 failed, 2 passed`) |
| Existing staffing/delegation tests | Staffing path regression | Re-run and cited: core 576 tests / 124 files, 0 failures |
| `apps/web/e2e/eval-station-staffing.spec.ts` | The CLI's tree, the API's seats with their skills, and the UI's roster and seat detail name the same agents; staffing starts no work on any surface | **Authored** — 3 tests, driving the web surface for the first time in this record |

Without committed tests locking *this* promise, the score is capped at **9**.

## Pass

- Binary: all oracle bullets hold on both a non-application and an application project.
- Score: **10** / 10.

## Evaluation status

The recorded verdict and checklist above remain the suite status. Detailed manual run logs, prior results, evidence, and historical blocker notes are in the [historical suite record](archive/03-stations-and-staffing-2026-10-30.md).

For current open product gaps, consult the [evaluation board](results/BOARD.md).

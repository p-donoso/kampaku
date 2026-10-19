# Kickoff — F-006, a roster that says six and creates five

Kampaku eval lab. A **blocking** row on the board for suite 03, and the only one whose defect **did not
reproduce** on this run — which is why it needs closing properly rather than by another clean run. You do the
work; I do not.

Read the measurements first:

- `.kampaku/runs/s03r3/logs/p0-infra.out` and `p0-webapp.out` — the two staffing turns of run `s03r3`: each
  proposed five stations and each created five (`create_sub_agent` appears exactly five times in each turn's tool
  list), and `GET /api/v1/agents` agrees with both returns.
- `.kampaku/runs/s03r3/logs/p0-webapp.out` — the one place the run's own claim and the tree disagreed, and it is
  worth reading closely: *"The lead's proposal named skill slugs that do not exist in this factory's catalog
  (`nextjs-app-router`, `react-components`, …). I did not create agents with dangling skills — I mapped each
  station to skills that exist."* The roster was created as proposed; the **skills** were substituted, and only a
  sentence in the reply says so.
- `.kampaku/runs/s03r2/logs/p0-infra.out` — the contaminated run, kept because it is the closest thing the lab
  has to the original shape: a first turn created three stations, an overlapping second turn created three more
  (`s3-infra-module`, `s3-infra-checks`, `s3-infra-docs`) under the same lead, and no surface said the roster had
  changed under it. Operator defect (two clients), but it is what a silent reshape looks like when it happens.
- `docs/eval/results/BOARD.md` — **[F-006]** (this row): *"The factory proposed a 6-role team with a dedicated
  owner for the hard subsystem, then created 5 and absorbed the missing role into another — while the lead's own
  description still claimed 6."* Its own note: *"Not blocking progression"* — and yet U8, which suite 03 needs,
  refuses a suite with an open blocking row. **The row is now the blocker. That is the wall this chat clears.**

## The defect, in one line

Staffing is a claim about a team, and nothing checks the claim against the tree: a station that fails to be
created, a skill that had to be substituted, or a role absorbed into another leaves the reply describing a team
that does not exist.

## Done means

- **The creation path reconciles what was proposed against what exists.** After `create_sub_agent` returns (or
  fails), the turn's own report of the roster comes from the tree — the seats that exist under that lead, with
  their skills — and **every difference is named**: a station that was not created and why, a skill that was not
  granted and what was granted instead. `apps/core/src/delegator/roster-validation.ts` (`assessPlanRoster`) is the
  precedent for the shape.
- **A partial staffing is a stated outcome, not a silent one.** If one of five seats is refused (a reserved name,
  an unknown skill, a duplicate), the reply says which, and the operator can act on it; the remaining four are
  not presented as the proposal.
- **A lock asserts it**, in `apps/core/tests/`: a staffing request whose proposal names a seat that cannot be
  created, and whose skills are partly unknown, produces a reconciliation that names both, and the tree agrees
  with it. Verified **red without the fix**.
- **The row is closed on evidence, not on another clean run**: the fix, the lock, and a re-measurement on a fresh
  data dir drive the difference path deliberately once (a proposal naming an unknown skill) and show it reported.
- **Patched with what was measured**: BOARD row status updated with the fix, the lock (verified red without it),
  the re-measurement path, `docs/eval/03-stations-and-staffing.md` the sentences it changes, one reviewable commit
  on `develop`, conventional commit with a scope. Leave alone what you did not touch; other sessions' prompts
  live under `docs/eval/prompts/`.

## Out of scope (each is its own row)

- **[F-062]** — an answered gate the next turn cannot see. Own chat.
- **[F-111]** — a question reused under an old id is never stored. Own chat.
- **[F-022]** — authoring a skill the catalog lacks. Own chat. **Do not** make the skill substitution a hard
  failure while fixing this: F-022 is what makes a substitution unnecessary, and this row is about *saying* what
  happened, not about refusing to staff.
- The web-facing roster page: it renders what the store holds.

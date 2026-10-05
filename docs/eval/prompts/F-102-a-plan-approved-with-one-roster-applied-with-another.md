# Kickoff — F-102, a plan approved with one roster and applied with another

Kampaku eval lab. A **blocking** product defect, measured on suite 08's fifth re-run `s08r12` (fresh data dir,
git `1fad3f1`, six driven turns). You do the work; I do not. **This is the wall that run stopped on.**

Read the measurements first — they are the whole brief:

- `.kampaku/runs/s08r12/logs/s08r12-p0-plan.out` — the applied-plan reply, including the lead's own report of
  the refused roster and the criterion it left unsatisfiable.
- `.kampaku/runs/s08r12/logs/s08r12-p1-execute.out` and `…-p1c-continue.out` — the two turns that re-raised it
  as a decision, and the front office's note that it *"did not ask it, it is a gate you opened earlier"*.
- `docs/eval/08-hands-off-execution.md` § *The fifth re-run, and the freeze that held* — the run, box by box.
- `docs/eval/results/BOARD.md` — **[F-102]** (this row) and **[F-079]** (**resolved**: *a plan whose acceptance
  criteria cannot be satisfied in the order the plan itself enforces* — this row is that flaw on the **staffing**
  axis instead of the ordering axis).

## The defect, in one line

The planner may preview a roster, the apply may **refuse that roster and silently substitute another**, and the
leaf whose acceptance criterion depended on the refused roster is **applied anyway** — so a plan the emperor
approved is not the plan that was persisted, and one of its leaves cannot be closed by anyone the project can
staff.

```text
preview roster:   kampaku-fullstack · kampaku-qa · kampaku-documenter · kampaku-auditor
apply:            refused — "External project (project_slug !== \"kampaku\"): platform agents such as
                   kampaku-fullstack are forbidden, and textstats-lead is the only agent under the project lead."
                  → all four leaves re-owned by textstats-lead

gate leaf e63211f4, persisted criterion, verbatim:
  "The auditor authored none of leaves one to three and modified no file other than its own gate document."
```

With one agent on the project that criterion is **unsatisfiable by construction**. It is not a mystery to the
product: the lead filed it as a blocker on the gate leaf, the front office escalated it as a decision, and the
run ended with the emperor approving a second station — **after four leaves of real work had already been built
against a plan whose last step nobody could sign.** The approval needs a turn to act on, so a run that started
with a satisfiable plan would have finished; this one stopped at 3 of 4 leaves closed.

## The live specimen (do not start a fresh data dir for this)

`.kampaku/runs/s08r12/data`, git `1fad3f1`, project **`textstats`**, fixture
`file:///home/pdonoso/projects/eval-seed-py`. The stack is **up** on the run's own ports
(`KAMPAKU_CORE_PORT=28082`, web `28004`); source `.kampaku/runs/s08r12/run.env` — `KAMPAKU_DOTENV_OVERRIDE=0`
matters.

- The gate leaf: `e63211f4-741c-4bed-9380-7de0bdd3d61e` — `todo`, `frozenPaths`
  `['src/', 'tests/', 'README.md', 'AGENTS.md', 'requirements/', 'pyproject.toml', '.github/']`, criterion above.
- Its container `f79de579-beff-4938-8293-98a0294bd88c` (`in_progress`) and the three leaves that closed under it:
  `7c272e0b`, `5e8d6b89`, and the docs slice `1e4b5e16`.
- The two gates this raised: `80e6a43d-d1f8-4f0a-9834-a05cdf49d4b2` (the lead's, with the full context field) and
  `7b97eb54-7013-4666-9f20-70794d312d46` (the front office's). Both are answered in this run's store; read them
  back — they are the defect's own record of itself.
- The roster rules the apply enforced: `apps/core/src/application/pm/` — start where `submit_intent` validates a
  delegated roster, and find out whether anything validates it at **preview** time as well.

## Done means

- **A plan the emperor approves is the plan that is persisted, or the difference is reported before it is
  applied.** If a roster is refused, that is a refusal of the *plan* — not a substitution the caller discovers by
  reading back the leaves and noticing who owns them.
- **A criterion that requires a station the project cannot have is caught where it is written, not where it is
  signed.** The independence requirement is legitimate; what is not legitimate is discovering, four leaves and
  three jobs later, that no one on the project can satisfy it. Whatever the check is — a validated roster on the
  plan, a staffing precondition on an independence criterion, or a preview-time refusal — it runs **before**
  the apply, and a test asserts it.
- **The honest path stays cheap.** A single-agent project that wants an independent gate must be told what it
  costs **at preview**, in the response the emperor is reading, rather than having it surface as a blocked leaf.
- **Patched with what was measured.** The BOARD row gets the fix, its lock, and the live re-measurement (a plan
  whose previewed roster cannot be staffed, driven end to end), `docs/eval/08-hands-off-execution.md` the
  sentences it changes, and the run dir the transcript. **One reviewable commit on `develop`**, conventional
  commit with a scope. A lock in `apps/core/tests/pm/` (or `tests/eval/`) verified **red without the fix**. The
  tree may carry untracked `docs/eval/prompts/` and another session's edits — **leave alone what you did not
  touch**.

## Out of scope (each is its own row — do not fold them in)

- **[F-101]** (a route that answers 201 to a field it does not read) — this run's other new row, own chat.
- **[F-053]** (the landed file ledger exists and no front-office tool reaches it) — own chat.
- **[F-098]**, **[F-100]** (the freeze is enforced at the write boundary and is still not a **criterion**: a
  closure rule that knows a path was frozen). **Not** this chat's work — this run measured the first half
  working.
- **Building the second station, or staffing this project** — that is the emperor's act, and this row is about
  the plan not requiring it silently.

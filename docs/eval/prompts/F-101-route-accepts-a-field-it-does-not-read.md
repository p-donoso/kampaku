# Kickoff — F-101, a documented route answers 201 to a field it does not read

Kampaku eval lab. A **blocking** product defect, measured on suite 08's fifth re-run `s08r12` (fresh data dir,
git `1fad3f1`, six driven turns). You do the work; I do not.

Read the measurement first — it is the brief:

- `docs/eval/results/BOARD.md` — **[F-101]** (this row), with the three-way measurement and the consequence.
- `docs/eval/08-hands-off-execution.md` § *The fifth re-run, and the freeze that held* — the run this came out
  of, and the paragraph that reads the leaderless container as a product gap rather than as the operator's typo.
- `apps/core/src/api/app.ts:87` — the route. `pm-routes.ts:79` — the same project-lead field on the update path.

## The defect, in one line

`POST /api/v1/projects` accepts a JSON body with **no schema**, reads the fields it knows, and answers **201** to
every field it does not — so a caller that names the lead under a different spelling gets a **leaderless
container and no error**, and the failure surfaces turns later as the front office refusing to plan.

```text
POST /api/v1/projects  {"slug":"probe-camel","name":"probe camel","projectLeadAgentId":"<lead-id>"}
  → 201   projectLeadAgentId: null            ← accepted, ignored, and never mentioned
POST /api/v1/projects  {"slug":"probe-nonsense","name":"…","totally_unknown_field":"x","lead":"textstats-lead"}
  → 201   repositories: [], no owner          ← likewise
POST /api/v1/projects  {"slug":"probe-snake","name":"…","project_lead_slug":"textstats-lead"}
  → 201   owned                               ← the one documented spelling
```

The cost is not local. A container with no accountable lead **cannot be planned**: the front office will not
delegate planning into a work order nobody owns, and it holds no tool that attaches a lead — correctly. So the
run spends a turn on an honest refusal, and the operator repairs it out of band with
`kampaku projects update <slug> --lead <slug> --yes`.

## The live specimen (do not start a fresh data dir for this)

`.kampaku/runs/s08r12/data`, git `1fad3f1`, project **`textstats`**, fixture
`file:///home/pdonoso/projects/eval-seed-py`. The stack for this run is **up** on the run's own ports
(`KAMPAKU_CORE_PORT=28082`, web `28004`); source `.kampaku/runs/s08r12/run.env` in the shell that drives it —
`KAMPAKU_DOTENV_OVERRIDE=0` matters, the repository `.env` otherwise wins.

- **The three probes are the specimen**, and they are deliberately left in this run's store: `probe-camel` and
  `probe-nonsense` read `projectLeadAgentId: null` (reproduce with
  `curl -s http://127.0.0.1:28082/api/v1/projects/probe-camel`), `probe-snake` is owned.
- The lead the seed meant: `textstats-lead`, `b0035ca4-4618-4643-8db5-741eceaa93ab`.
- The turn where the missing lead was paid for: `.kampaku/runs/s08r12/logs/s08r12-p0-plan.out` — the front
  office's first reply, *"the lead agent you'd expect to own this — `textstats-lead` — exists in the tree, but
  it is **not linked to this container**"*.
- Suite 08's own read of the same fact: `.kampaku/runs/s08r11/logs/s08r11-p0-plan.out`.

## Done means

- **A route that documents named fields rejects a body it does not recognise, or reads the aliases it accepts.**
  201 to a request you only partly understood is the one answer that cannot be acted on. Whatever you choose,
  the **unknown-field answer is asserted by a test**, and so is the answer for a *recognised-but-invalid* value
  (a lead slug that does not exist), because silence and 201 are the same defect seen twice.
- **A caller can tell that its lead was not attached.** If the field is optional, the response says what it did
  with it — an `owner: null` on a 201 that named an owner is a contradiction on the surface that caused it.
- **The rule generalises to the rest of the API surface, or the commit says why it does not.** The same
  no-schema body shape is on other routes; a fix that hardens one route and leaves the class standing is the
  defect reporting itself.
- **Patched with what was measured.** The BOARD row gets the fix, its lock, and the live re-measurement (the
  three probes re-run and answered), `docs/eval/08-hands-off-execution.md` the sentences it changes, and the run
  dir the transcript. **One reviewable commit on `develop`**, conventional commit with a scope. A lock in
  `apps/core/tests/api/` (or `tests/eval/`) verified **red without the fix**. The tree may carry untracked
  `docs/eval/prompts/` and another session's edits — **leave alone what you did not touch**.

## Out of scope (each is its own row — do not fold them in)

- **[F-102]** (a plan approved with one roster and applied with another, so a leaf no roster can close was
  applied anyway) — this run's other new row, own chat.
- **[F-053]**, **[F-078]**, **[F-096]** — open, and **not** this chat's work.
- **Re-running suite 08 for its verdict** — that happens on a fresh data dir, after the rows that hold its score
  down are answered.

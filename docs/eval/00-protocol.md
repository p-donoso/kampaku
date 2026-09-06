# 00 — Protocol (empty instance)

## Purpose

Define a repeatable empty-instance run so suites are comparable. This protocol is operator-facing. Prefer public README commands, CLI, UI, and documented HTTP. Peeking into SQLite or private tables to "prove" a pass is a **product smell**: record it on `BOARD.md` even if the suite otherwise passes.

## Empty instance

1. Choose a **new** data directory (do not reuse a personal production data dir).
2. Clean monorepo checkout. Install using the commands the **public root README** documents. If those commands fail, suite 01 fails as a product gap.
3. Configure the minimum env the public docs require for real model-backed chat/planning (provider endpoint and key). Do not rely on undocumented local tricks.
4. Start the stack with the public start command(s). Control plane, worker, and operator UI must come up as documented.
5. Confirm health with whatever the product exposes to operators (health endpoint and/or status CLI).
6. Log git SHA, data dir path, model/provider label, and wall-clock start in every suite run log.

### What "empty" does not mean

- It does not require a specific internal agent tree shape from private ADRs.
- It does require either a comprehensible default team/project **or** a clear question to the emperor before inventing one.

## Measurement glossary

| Signal | Operator oracle |
|--------|-----------------|
| Alive | Health/status responds; UI loads |
| Same truth | Same resource IDs and fields across chat, CLI, and web after one mutation |
| Real work | Files on disk / git history match what the board claims |
| Human gate | Pending question or approval is visible in UI and CLI without digging logs |
| Survival | After process kill and restart, work resumes or the product states loss honestly |
| Isolation | Stranger-repo jobs do not modify platform source; platform jobs do not rewrite the stranger repo unless asked |

## Scoring

- **Binary pass**: every oracle bullet for the suite holds.
- **Advisor score 1–10**: independent judgment (see README). Record even on fail.
- **Suite green**: binary pass **and** advisor **10/10**. Below 10 means open product lift work on `BOARD.md`.
- **Blocked**: cannot run because a prior suite or environment gap blocks it. Prefer `blocked` over a fake pass.

## Performance notes (optional per run)

Record when useful:

- Wall clock for the suite
- Number of visible jobs / work items created
- Whether the system exhausted tool/iteration budget mid-task (product defect, not "the model is like that")
- Whether the suite markdown alone was enough for a stranger

## Language

Eval markdown stays in English. Emperor chat during a run may use Spanish; durable artifacts the product writes must still meet the product's own English persistence rules if it claims them — judge honesty of published memory in suite 09.

## Fresh re-run rule

After closing board items, re-run affected suites from a **fresh** data dir before claiming the suite green. Partial state from a patched mid-run does not count as empty-instance pass.

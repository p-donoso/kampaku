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
| Same truth | Same resource IDs and fields across chat, CLI, and web after one mutation (or after inspect, for read-only suites) |
| Real work | Files on disk / git history match what the board claims |
| Human gate | Pending question or approval is visible **and answerable** in UI and CLI without digging logs |
| Survival | After process kill and restart, work resumes or the product states loss honestly |
| Isolation | Stranger-repo jobs do not modify platform source; platform jobs do not rewrite the stranger repo unless asked |
| Cost | Tool/iteration budget exhaustion mid-task is recorded as a product defect |

## Scoring

See [README.md](README.md) — **What advisor 10/10 requires**.

Summary:

- **Binary pass**: every oracle bullet for the suite holds.
- **Advisor 1–10**: independent judgment. Manual-only evidence caps at **9**.
- **Testing gate**: **10 requires automated tests** cited in the suite file that lock the promise.
- **Universal gates U1–U8** must all hold for 10 (empty instance, public docs, three-surface truth, tests, fresh re-run, cost honesty, no catalog capture, BOARD clean).
- **P-gates** apply when the suite oracle depends on honest done, isolation, UI human-gate, survival, shared truth, or human-readable plan.
- **Suite green**: binary pass **and** advisor **10/10**.
- **Blocked**: prior open blocker; prefer `blocked` over a fake pass.

## Performance notes (record when relevant)

- Wall clock for the suite
- Number of visible jobs / work items created
- Whether tool/iteration budget was exhausted mid-task
- Whether the suite markdown alone was enough for a stranger (U1/U2)

## Language

Eval markdown stays in English. Emperor chat during a run may use Spanish; durable artifacts the product writes must still meet the product's own English persistence rules if it claims them — judge honesty of published memory in suite 09.

## Fresh re-run rule (U5)

After closing board items, re-run affected suites from a **fresh** data dir before claiming the suite green. Partial state from a patched mid-run does not count as empty-instance pass. Automated tests must be green in the same commit window cited in Evidence.

## Incremental fixes (do not break closed suites)

Product fixes for suite **N** must be **additive**. A later suite must not weaken or remove the promise locked by an earlier green suite.

Before claiming suite **N** green:

1. Keep prior suites’ automated tests in the same commit (do not delete or soften their assertions to make N pass).
2. Re-run **all** cited automated tests for suites **01…N** (unit + e2e where they exist) and record that regression pass in Evidence or the run log.
3. Prefer new tools, narrower runtime gates, and extra tests over changing behavior that suite M&lt;N already scored as 10.
4. If a later design change must alter an earlier promise, **re-open** that suite on `BOARD.md`, re-run it on a fresh data dir, and re-score — do not leave it marked green from an old commit.

## Automated test lab notes (U4)

Recorded while greening suite 01 — follow these so e2e is honest:

1. **Explicit env wins over workspace `.env`**: set `KAMPAKU_DOTENV_OVERRIDE=0` when launching Core for Playwright/CI so `KAMPAKU_AGENT=stub` (and data dir / workspace) are not overwritten by the monorepo `.env`.
2. **One Next.js process per `apps/web`**: Next 16 refuses a second `next dev` in the same directory even on another port. Stop `kampaku dev` web (or the whole stack) before running web e2e that starts its own webServer.
3. Prefer dedicated ports (e.g. Core `18080`, web `13002`) and a fresh `PLAYWRIGHT_CORE_DATA_DIR` empty directory.
4. Stub e2e proves UI wiring; suites that claim **provider** honesty must also run an LLM path (see [17-provider-fidelity.md](17-provider-fidelity.md)).

Deferred learnings: [LEARNINGS.md](LEARNINGS.md).

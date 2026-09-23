# Archived eval battery (superseded 2026-09-23)

Historical records. **Nothing here is a current acceptance criterion.**

The files were moved here unchanged — no oracle, run log, or evidence was rewritten — when the
product was restated as a software factory ([ADR-0004](../../adr/0004-software-factory-charter.md)).

## Why they were superseded

Two independent reasons, both recorded in the files themselves:

1. **Most were already marked superseded** (`Historical oracle (superseded 2026-09-11)`). From
   2026-09-15 the lab's current contract was the advisory-only orchestration contract, and the
   numbered suites were retained as lab history rather than current criteria.
2. **Their framing no longer matches the product.** Suites 03, 05, 06, 07, 11, 18 and 19 explicitly
   required the product to be domain-agnostic — to *not* assume software, to staff non-software
   domains without engineering roles, to produce non-code stranger work, and to avoid engineering
   acceptance criteria on non-software deliverables. The factory refuses non-technical deliverables
   by decision, so those oracles now contradict the statute.

## What replaced what

| Archived | Disposition |
|----------|-------------|
| `01-fresh-start.md` | Replaced by [01-work-order-intake.md](../01-work-order-intake.md) — same inventory honesty, plus the work-order intake path the original could not test |
| `02-three-surfaces.md` | Kept and rewritten as [02-three-surfaces.md](../02-three-surfaces.md) |
| `03-standing-team.md` | Rewritten as [03-stations-and-staffing.md](../03-stations-and-staffing.md) — staffing follows the aspects on disk, not a fixed roster, and no longer asks for non-software teams |
| `04-capability-boundary.md` | Kept and rewritten as [04-capability-boundary.md](../04-capability-boundary.md), including the out-of-scope refusal the factory now owes |
| `05-intent-to-work.md` | Rewritten as [05-intent-to-work-order.md](../05-intent-to-work-order.md) |
| `06-stranger-repo.md` | Rewritten as [06-greenfield-stranger-repo.md](../06-greenfield-stranger-repo.md) — software only, toolchain honesty added |
| `07`–`11` | Kept and rewritten as [07](../07-plan-a-human-can-run.md)–[11](../11-honest-done.md) with the factory gates added |
| `12`–`17` | Kept and rewritten as [12](../12-scope-and-approval.md)–[17](../17-provider-fidelity.md) |
| `18-domain-agnostic-work.md` | **Retired.** Replaced by [18-language-agnostic.md](../18-language-agnostic.md), [19-brownfield-and-legacy.md](../19-brownfield-and-legacy.md) and [20-multi-repo-and-services.md](../20-multi-repo-and-services.md): the same agnosticism claim, moved from domains-abstraction to the three invariants that are actually promised |
| `19-one-shot-scientific-calculator.md` | Replaced by [25-factory-arc.md](../25-factory-arc.md) — same integration-arc purpose, software scope, plus the stack and architecture invariants in one narrative |
| `20-execution-assurance.md` | Kept and extended as [24-execution-assurance.md](../24-execution-assurance.md) |
| `current-orchestrator-contract.md` | Superseded by [factory-contract.md](../factory-contract.md) and [ADR-0005](../../adr/0005-factory-authority-model.md). Its exact-allowlist assertion is the contradiction the new contract removes |

## What was preserved deliberately

- **The evidence.** Each archived file keeps its run log, result, and score from its original run.
  They are the record of what the product did on that date, and they are the reason several current
  gates exist: the silent-WAV lesson, the invented-README lesson, the no-op-turn lesson, and the
  question-with-no-durable-sink lesson all trace to these runs.
- **The debts.** Rows in [`../results/BOARD.md`](../results/BOARD.md) and
  [`../results/LEARNINGS.md`](../results/LEARNINGS.md) that referenced these suites were carried
  forward rather than deleted.

## Using these files

Read them for history and for methodology. Do not use them to judge the product today, and do not
re-open an archived oracle because the product currently fails it — if a promise in here still
matters, it belongs in the current series, restated under the factory framing.

The one archived item worth reading as a *method* rather than a record is the domain-agnostic suite
18: it is a good template for how to test an invariant, which is why its structure survives in
suites [18](../18-language-agnostic.md), [19](../19-brownfield-and-legacy.md) and
[20](../20-multi-repo-and-services.md).

# Learnings from suite runs (deferred work)

Capture product elevation ideas found while greening a suite. Prefer **folding into an existing later suite** when the promise already fits. Add a **new suite** only when no later file owns the gap.

Language: product gaps and operator oracles — not skill/tool checklists.

## From 01 — Fresh start (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Real LLM can invent an empty world when inventory tools are weak or unused | Stub green ≠ emperor-grade inventory | Fixed in 01 (`list_projects` + prompt). **Deepen in [17-provider-fidelity.md](17-provider-fidelity.md)** (multi-project, wrong-slug recovery under real provider). |
| Workspace `.env` can overwrite CI/e2e `KAMPAKU_AGENT=stub` | Automated U4 flakes or silently runs LLM | Protocol note in [00-protocol.md](00-protocol.md); product: `KAMPAKU_DOTENV_OVERRIDE=0`. |
| Next.js 16 locks one `apps/web` dir — Playwright cannot start while `kampaku dev` web is up | Blocks honest U4 without tribal knowledge | Protocol lab note in 00; later: document or fix dual-dev (suite 16 / ops). |
| "What must I decide?" after a healthy default invents missing vision/CI/repo work | Fake first-run blockers when the instance is already ready | Fold into [05-intent-to-work.md](05-intent-to-work.md) oracle. |
| Three-surface truth needs **UI content** + e2e, not HTTP 200 | Already U3; easy to skip under time pressure | Keep pressure on 02/16; 01 now cites Playwright. |
| `serve` must seed defaults without a separate bootstrap | Empty instance stranger path | Fixed in 01 (`bootstrapProject` on serve). |

## From 02 — Three surfaces (2026-09-06)

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| Advisor cannot set a visible project note blocks three-surface emperor prompts | Chat claimed success or dead-ended while CLI/web could mutate | Fixed in 02: Kampaku may update **name/description** only. **Prove the deny path in [04-capability-boundary.md](04-capability-boundary.md)** (lead/repos/wiki still blocked). |
| Detail panel Save closed over stale `getHandlers()` | Web edits appeared to save but API stayed old | Fixed for shared header actions in 02. **Generalize in [16-operator-ui.md](16-operator-ui.md)** — edit+save on project **and** another entity type must persist to API. |
| `get_project` without `id` weakens id confirmation | Chat/CLI/web id parity needs the UUID in tool output | Fixed in 02. **Keep pressure in [17-provider-fidelity.md](17-provider-fidelity.md)** — real provider must echo id after mutation. |
| Metadata mutation must not become silent governance | Emperor may ask to reassign lead or rewrite repos via chat | Fold deny/ask into **04** and **12**; staffing in **03** must not invent a second lead via advisor-only path. |
| Incremental regression across green suites | Suite 02 changes could break suite 01 | Protocol rule in [00-protocol.md](00-protocol.md); verified 01+02 tests together. |

**No new suite file from 02** — ownership fits 03/04/12/16/17.

## How to use this file

1. After greening a suite, append a dated section.
2. Update the target suite (or add a suite file) in the same PR when practical.
3. Open `BOARD.md` only for **blocking** product gaps; learnings here may be deferred non-blockers.

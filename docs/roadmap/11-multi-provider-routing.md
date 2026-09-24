# 11. Multi-provider model routing

- **Document:** `11 — Multi-provider routing`
- **Kind:** `deliverable`
- **Status:** `Proposed`
- **Owner:** core / worker
- **Dependencies:** [statute](../product/software-factory.md), [ADR-0002](../adr/0002-mvp-implementation-stack.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 17](../eval/17-provider-fidelity.md),
  [measurement program](12-measurement-program.md)
- **Last reviewed:** 2026-09-24

## Two parts, deliberately split

This document contains two pieces of work with different priorities, and they used to be scheduled as
one — which is why measurement sat behind a capability phase.

| Part | What it is | When |
|------|------------|------|
| **A — One documented endpoint contract** | A single `KAMPAKU_MODEL_*` contract, no vendor names anywhere shipped, an actionable failure when the endpoint is missing, and a decided answer on the legacy aliases | **First.** It gates every suite run, and therefore gates the whole measurement program |
| **B — Routing, chains, failover** | Ordered chains, cooldown, retry budgets, per-target capability negotiation, cost and usage reporting | Later, when a real need is proven by runs across more than one endpoint |

Part A is small and unblocks measurement; Part B is a capability in its own right. The adoption
sequence ([this roadmap](README.md)) schedules Part A as Step 0 and leaves Part B in the queue.

## Part A — One documented endpoint contract

**Gate.** With only a base URL and a key configured, the front office, planning, worker execution, and
the settings UI work against an arbitrary OpenAI-compatible endpoint; with none configured, startup
fails with an error naming the missing setting and makes no implicit local connection; and a
repository-wide search for a vendor name over shipped source, contracts, scripts, env templates,
README, and docs returns nothing except marked historical records.

Measured state: **not met.** A provider is still named in `.env`-loading code, in the CLI status
block, and in vendor-prefixed fallbacks in `apps/core/src/config.ts`.

- [ ] One documented contract: `KAMPAKU_MODEL_BASE_URL`, `KAMPAKU_MODEL_API_KEY`,
  `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS`, `KAMPAKU_MODEL_INITIAL_RETRIES`,
  `KAMPAKU_EXECUTOR=openai-compatible|echo`, with documented precedence over runtime settings.
- [ ] No provider default host. A missing base URL or key fails with an actionable error.
- [ ] Workspace `.env` loading accepts `KAMPAKU_*` only, and the vendor-prefixed names are gone
  from config, scripts, error strings, env templates, contracts, and any status output.
  - [ ] `packages/contracts/tool-specs/code-agent.json` — a shipped contract whose description
        names the vendor. Found by the phase-01 surface sweep.
  - [ ] `apps/core/src/cli/commands/dev.ts` — the user-facing `dev` command description names it.
  - [ ] `apps/core/src/cli/welcome.ts` — the status label prints it.
  - [ ] `apps/core/src/config.ts` — vendor-prefixed fallbacks and the implicit local default.
- [ ] A regression guard fails the build when a vendor name reappears in shipped source, contracts,
  scripts, or env templates.
- [ ] The legacy-alias decision below is answered, and either a migration with a warning or a
  documented break is implemented.
- [ ] A repository-wide search returns nothing outside marked historical records.

### Open decision — the legacy aliases

The documented contract is `KAMPAKU_MODEL_*`, but the current operator environment still sets
vendor-prefixed names, so removing them in one change breaks a running setup. Two defensible answers:

1. **Migrate with a warning for one release window.** Accepted names keep working, each use emits a
   deprecation warning naming the replacement, and the names are removed at the end of the window.
2. **Break cleanly.** The aliases are removed in one change, the release notes state the break, and
   the operator updates their environment.

This is an operator decision about a running deployment, not a code preference, which is why it is
recorded rather than assumed. Recommended: option 1, because the platform's own eval protocol treats
silent behavior changes as defects, and because the measurement program's baseline should not be
blocked on an environment edit.

## Part B — Routing

The factory should use multiple model providers through an ordered, configurable routing policy.
Provider choice is an execution concern; project behavior and evidence must remain portable.

## Routing chain

Each routing profile may define an ordered chain of provider/model targets:

```text
primary provider/model
        ↓ unavailable, exhausted, or cooling down
secondary provider/model
        ↓ unavailable, exhausted, or cooling down
tertiary provider/model
```

The router advances only when the current target is ineligible. It must not silently change the
requested task, permissions, tools, or acceptance criteria.

## Eligibility and fallback

A target may be temporarily ineligible because of:

- provider outage or connection failure;
- rate-limit or quota exhaustion;
- configured token or spend limit;
- cooldown after repeated failures;
- timeout budget exhaustion;
- model or capability incompatibility.

## Minimum compatibility gate

Before a provider/model target is enabled for factory work, it must be verified to support:

- text input and text output;
- the required tool-calling format;
- structured tool arguments and results;
- the context and output limits required by the workload;
- the authentication and streaming behavior expected by the executor, when applicable.

A text-only model or a model without compatible tool support must not be selected for an agent task
that requires tools. Compatibility is workload-specific: a target may be valid for text-only
classification or summarization while remaining ineligible for repository execution.

The policy must define retry count, cooldown duration, fallback timeout, and the conditions that
reset a target to healthy. A failed fallback chain produces a durable blocked or failed state, not a
success claim.

## Settings menu

Settings should configure and display:

- provider and model targets;
- chain order per routing profile or workload;
- enabled and disabled targets;
- credentials and secret references, never raw secret values;
- rate, token, quota, and spend limits;
- retry and timeout budgets;
- cooldown thresholds and durations;
- whether fallback is allowed for a workload;
- verified capabilities per provider/model, including text and tool support;
- provider health, current cooldown, recent failures, and last successful use.

Changes should be validated, auditable, and applied without requiring prompt edits. Existing running
jobs keep their resolved routing decision unless an explicit retry policy says otherwise.

## Truth and observability

Every model attempt records:

- provider and model;
- routing profile and chain position;
- start and end time;
- fallback reason, if any;
- retry and cooldown outcome;
- bounded usage and cost metadata when available;
- result, failure, or blocked status.

Operator views should explain why routing advanced. They must not expose credentials or imply that a
provider succeeded when the attempt failed.

## Boundaries

- Provider adapters implement one normalized executor contract.
- Provider-specific features are capability-checked before assignment.
- Fallback does not bypass project, agent, task, skill, sandbox, or human-approval boundaries.
- Provider selection must not be embedded in project skills or acceptance criteria.
- A provider outage must not corrupt task state or duplicate unsafe execution.

## Success condition

An operator can configure a provider chain in Settings, observe health and cooldown state, and have
the factory continue with the next eligible target while preserving context, permissions, truthful
attempt history, and durable failure state.

## Implementation checklist

- [ ] Define the normalized model-executor contract.
- [ ] Define provider/model target health and cooldown states.
- [ ] Verify text input/output and compatible tool calling before enabling a target.
- [ ] Configure ordered chains, limits, retries, and fallback rules in Settings.
- [ ] Preserve task context, tools, permissions, and acceptance criteria across fallback.
- [ ] Record provider, model, chain position, reason, result, and usage per attempt.
- [ ] Hide credentials while exposing health and routing decisions.
- [ ] Test outage, quota exhaustion, cooldown, timeout, incompatibility, and full-chain failure.
- [ ] Test that fallback cannot duplicate unsafe execution or bypass human gates.
- [ ] Confirm no provider, model, or endpoint name is required by the product.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] **Part A** — One documented `KAMPAKU_MODEL_*` contract, with precedence over stored settings
- [ ] **Part A** — No shipped source, script, env template, contract, or error message requires a vendor name
- [ ] **Part A** — A missing endpoint fails with an actionable message and makes no implicit local connection
- [ ] **Part A** — A regression guard fails the build when a vendor name reappears
- [ ] **Part B** — Ordered chains with per-target health, cooldown, and eligibility
- [ ] **Part B** — Capability is verified per endpoint before a target is enabled for work
- [ ] **Part B** — Every attempt records provider, model, chain position, reason, result, and usage
- [ ] **Part B** — Fallback cannot bypass project, agent, task, skill, sandbox, or approval boundaries
## Gate

**Any OpenAI-compatible endpoint is a first-class choice, and no named provider is part of the
product.** With only a base URL and a key configured, the front office, planning, worker execution,
and the settings UI work against an arbitrary endpoint; with none configured, startup fails with an
error naming the missing setting and makes no implicit local connection.

Scored by [eval 17](../eval/17-provider-fidelity.md). The current gap is that a provider is still
named in configuration, scripts, error text, and status output — the `FreeLLMApi` line in the CLI
status block and the vendor-prefixed fallbacks in `apps/core/src/config.ts`. Closing that is this
phase's measurable deliverable, and a repository-wide search for the retired name over shipped
source, contracts, scripts, and env templates is the acceptance test.

Open related row: [BOARD F-008](../eval/results/BOARD.md) — a model can advertise tool support and
fail to call tools, so capability must be negotiated per endpoint rather than advertised.

## Software scope and invariants

Provider neutrality is **execution portability, not deliverable flexibility**. Routing decides which
endpoint runs an agent; it does not decide what the factory accepts, and it must never be used to
widen scope or to route a refused request to a more permissive model.

This phase must also leave the other two invariants untouched: fallback cannot change the project's
toolchain, architecture, or acceptance criteria ([invariants](../concepts/agnosticism-invariants.md)),
and a provider outage produces a durable failed or blocked state rather than a success claim. Provider
selection must not be embedded in skills or acceptance criteria — a criterion that names a model
measures the model, not the software.

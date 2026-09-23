# 11. Multi-provider model routing

- **Phase:** `11 — Multi-provider routing`
- **Status:** `Proposed`
- **Owner:** core / worker
- **Dependencies:** [01](01-philosophy.md), [ADR-0002](../adr/0002-mvp-implementation-stack.md)
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md), [eval 17](../eval/17-provider-fidelity.md)
- **Last reviewed:** 2026-09-23

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

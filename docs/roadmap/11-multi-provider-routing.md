# 11. Multi-provider model routing

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

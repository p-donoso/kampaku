# 11. Multi-provider model routing

- **Document:** `11 — Multi-provider routing`
- **Kind:** `deliverable`
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

**Part A is hygiene, not a gate.** It was originally scheduled as Step 0 on the claim that it
"gates every measurement", and that claim is false: the documented `KAMPAKU_MODEL_*` pair already
works and takes precedence, [eval 17](../../docs/eval/17-provider-fidelity.md) accepts either naming,
and no suite lists the contract as a prerequisite. Active delivery priority is tracked in the
[Kampaku Roadmap Project](https://github.com/users/p-donoso/projects/2); the original sequencing
rationale remains historical context, not an active schedule.

## Part A — One documented endpoint contract

**Gate.** With only a base URL and a key configured, the front office, planning, worker execution, and
the settings UI work against an arbitrary OpenAI-compatible endpoint; with none configured, startup
fails with an error naming the missing setting and makes no implicit local connection; and a
repository-wide search for a vendor name over shipped source, contracts, scripts, env templates,
README, and docs returns nothing except marked historical records.

Measured state: **implemented 2026-09-24, with two caveats stated below.**

- [x] One documented contract: `KAMPAKU_MODEL_BASE_URL`, `KAMPAKU_MODEL_API_KEY`,
  `KAMPAKU_MODEL_INITIAL_TIMEOUT_MS`, `KAMPAKU_MODEL_INITIAL_RETRIES`,
  `KAMPAKU_EXECUTOR=openai-compatible|echo`. Core and worker read the same five names from the same
  place, and the worker's vendor-prefixed fallbacks went with them.
- [x] No provider default host. A missing base URL fails with a message naming the setting, **at the point
  the model is needed** rather than at config load, so `KAMPAKU_AGENT=stub` still runs with no endpoint.
  That placement is load-bearing, and the tests said so: building the broker eagerly turned a hundred of
  them red, because stub mode was constructing a broker it never uses.
- [x] Workspace `.env` loading accepts `KAMPAKU_*` only.
  - [x] `packages/contracts/tool-specs/code-agent.json` — the description no longer names a vendor.
  - [x] `apps/core/src/cli/commands/dev.ts` — the description, and `--no-model-endpoint` in place of the
        vendor-named flag.
  - [x] `apps/core/src/cli/welcome.ts` — the status line says `Model endpoint`.
  - [x] `apps/core/src/config.ts` — vendor-prefixed fallbacks and the implicit local default removed.
  - [x] `apps/worker/src/{config.ts,executor/model-agent.ts}` — the same, **plus the compatibility shim
        that read a second set of fields** from programmatic callers. Two names for one setting is the
        shape that let a stored value outrank an environment variable without saying so (F-026).
  - [x] `scripts/start.sh`, `scripts/stop.sh`, `apps/core/README.md`, `.env.example`.
- [x] A regression guard. `apps/core/tests/eval/eval-endpoint-contract.test.ts` walks shipped source,
  contracts, scripts, env templates, and the READMEs that ship beside them, and fails on any vendor name.
  **Writing it found `apps/core/README.md`** — a file the phase-01 surface sweep had listed and nobody had
  actually fixed. It is a test rather than a build step because the test suite is what gates a change
  here, and the difference is recorded rather than glossed.
- [x] A repository-wide search returns nothing outside marked historical records.
- [x] The legacy-alias decision is answered below, and the clean break is implemented.

### What the guard deliberately does not scan

`docs/` is excluded, and that is the distinction the gate enforces rather than a hole in it: the roadmap
records **are** the marked historical record. The BOARD rows, the baseline run logs, the LEARNINGS and
the ADRs all have to be able to write "this used to be called X" in order to say honestly when it
changed. A guard that scrubbed them would destroy the audit trail it belongs to.

**Shipped surface names what it does. Historical record may name what it was.**

### Two caveats, stated rather than implied

1. **The settings UI was not driven in a browser.** `resolveModelProviderSettings` and
   `saveModelProviderSettings` refuse to fall back to a host and fail with a message;
   `model-provider-settings.test.ts` covers that. What has not been done is opening `/settings/models` and
   saving an endpoint there, which is what this gate's wording asks for. Unverified, not claimed.
2. **`KAMPAKU_MODEL_ENCRYPTION_KEY` is a leftover.** The operator's `.env` had a vendor-prefixed
   `ENCRYPTION_KEY` for their own compose deployment. A mechanical rename produced a `KAMPAKU_`-prefixed
   name for it, and **it is not part of this contract** — it belongs to whichever service needs it, named
   by that service. Left in place rather than guessed at, because renaming a running deployment's
   encryption key on a hunch is worse than leaving one name misplaced.

### The legacy-alias decision — answered: option 2, clean break

The documented contract is `KAMPAKU_MODEL_*`. Two answers were on the table: keep the vendor-prefixed
names working for a release window with a deprecation warning, or remove them in one change.

**Clean break, taken 2026-09-24.** The aliases are gone in one change and this document is the break
notice.

The recommendation above was option 1, and rejecting it is worth the sentence: **a deprecation window
carries two names for one setting**, which is exactly the shape that produced F-026 — a stored value
outranking an environment variable with nothing saying so. A shim would have reproduced that defect
deliberately, for a release, to avoid one environment edit.

The sequencing objection to a clean break was that the measurement baseline should not be blocked on an
environment edit. By the time this was implemented, suite 01 had already run green on the production
endpoint, so the measurement was taken and the objection no longer applied.

**What the operator changes, and it is one block in `.env`:**

```diff
- FREELLMAPI_BASE_URL=...
- FREELLMAPI_API_KEY=...
- KAMPAKU_EXECUTOR=freellmapi
+ KAMPAKU_MODEL_BASE_URL=...
+ KAMPAKU_MODEL_API_KEY=...
+ KAMPAKU_EXECUTOR=openai-compatible
```

A missing name is not silent: the next model call fails with a message naming the setting.

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

### Context size is part of the gate, and it was missing

Measured 2026-09-24 on the local endpoint, and it cost five suite runs before anyone looked:

```text
llama-server ... -c 4096 ... --context-shift
ollama ps   →  CONTEXT 4096
ollama show qwen2.5:14b  →  context length 32768
```

The model supports 32 768 tokens and was served at 4 096, with `--context-shift` discarding the oldest
tokens once full. Nothing surfaces in the response, the CLI, or the logs. `prompt_eval_count` is pinned at
2 050 tokens for any prompt above the limit — a 32k, a 48k and a 72k-char prompt all reported **2 050** —
and a marker at the start of a long prompt is retrieved when the prompt fits and **gone** when it does
not.

**The orchestrator's system prompt alone measures 4 086 tokens against that 4 096 limit.** The
durable-state block, the history, and the operator's question were dropped from the front on every turn
of every baseline run.

This section already required that a model advertising tool support be *verified* to call tools rather
than silently retried ([F-008](../eval/results/BOARD.md)). Context belongs in the same gate, for the same
reason: an endpoint that quietly discards two thirds of the prompt is indistinguishable from a model that
read it and answered badly, so every measurement taken through it is worthless — and five were taken.

Requirements, recorded as [F-032](../eval/results/BOARD.md):

- discover the effective context at startup, per endpoint, and **fail loudly** when the assembled turn
does not fit, rather than sending a truncated turn and scoring the reply;
- never let a truncating endpoint satisfy a suite — a run that could not fit its own prompt is not a
  measurement of the product;
- report the effective context wherever the model is reported, as `mode: llm · model: …` already is, so
  an operator can see what they are actually running.

The `-c 4096` on this host is an **environment** defect — the operator's fix is `OLLAMA_CONTEXT_LENGTH`
or a per-request `num_ctx`. Detecting and refusing an overflow is the **product** gap, and it is the one
that generalises to the next endpoint.

## Minimum compatibility gate — what must be verified

Before a provider/model target is enabled for factory work, it must be verified to support:

- text input and text output;
- the required tool-calling format;
- structured tool arguments and results;
- **the context and output limits required by the workload — see above.** The bullet was already here and
  was never checked, which is the whole of F-032: a target that was enabled while silently discarding
  two thirds of every prompt;
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

# 17. AI interaction expertise

- **Document:** `17 — AI interaction expertise`
- **Kind:** `deliverable`
- **Status:** `In progress`
- **Owner:** core / contracts
- **Dependencies:** [07](07-engineering-skills.md), [08](08-project-agent-roster.md), [11](11-multi-provider-routing.md) § Part A
- **Related documents:** [statute](../product/software-factory.md),
  [agnosticism invariants](../concepts/agnosticism-invariants.md),
  [security model](../security/security-model.md), [eval 17](../eval/17-provider-fidelity.md),
  [eval 22](../eval/22-dependencies-and-supply-chain.md), [skills](../concepts/skills.md)
- **Last reviewed:** 2026-09-24

## Purpose

The factory builds software. A large and growing share of the software this operator builds
**contains AI interaction**: system prompts, Agent Skills, model calls, and a bring-your-own-key
(BYOK) configuration where the end user supplies the endpoint and the credential.

That software has a defect class nothing in the factory currently addresses. A prompt is behavior,
and it can be wrong in ways no compiler catches:

- it produces the wrong output for a representative input, and no test notices;
- it instructs a model to call a tool, skill, or parameter the surrounding code does not provide —
  the same shape as [BOARD F-001](../eval/results/BOARD.md), where an instruction named an
  unreachable tool and a test locked the contradiction;
- it works on the endpoint the author happened to use, and fails on any other, which is certain
  under BYOK;
- it quietly costs ten times what it should, because context is unbounded and every turn re-sends it;
- it leaks the user's key into a log, an error, or an artifact.

The product's evidence rules apply to behaviour, and a prompt is behaviour — yet a project that is
mostly prompts can be "complete" with every prompt unverified, because the lab scores **Kampaku**,
not the project under construction.

This phase adds the station that owns that surface, and the checks that make its claims verifiable.

## Outcome

For any project the factory builds that contains prompts, skills, or model calls:

- every prompt and skill has at least one check that proves its behaviour on a representative input;
- no prompt names a tool, skill, or parameter the surrounding code does not provide;
- behaviour is proven on **at least two OpenAI-compatible endpoints**, because BYOK means the
  operator's endpoint is arbitrary;
- a BYOK key is never logged, echoed into an artifact, or committed, and a missing, invalid, or
  rate-limited key fails closed with an actionable message;
- cost and efficiency are **measured from the application's own attempt records**, against a stated
  budget, and a regression is treated like a failing test;
- an AI-interaction specialist is staffed **when the project has that aspect**, discovered from the
  repository.

## The roster question, answered honestly

The request that produced this phase was to add an AI prompt expert to the **default roster**. That
literal instruction cannot be followed, and the reason is a defect this roadmap already tracks.

`defaultProjectTeamSlugs()` in `apps/core/src/application/bootstrap/kampaku-platform-team.ts` returns
a fixed `lead / frontend / backend / qa / auditor` team, called from
`plan-and-delegate.ts`. That fixed template is precisely what
[invariants §2](../concepts/agnosticism-invariants.md) forbids — *"it may not default to a six-role
web-app team"* — and what [07](07-engineering-skills.md) lists as work to remove. Adding a seventh
fixed role would make that defect worse, not better, and it would fail for any project that is not a
web application.

So the addition is split by what each mechanism is actually for, using the catalog/roster
distinction that [08](08-project-agent-roster.md) already draws:

| Mechanism | Gets the AI-interaction expertise? | Why |
|-----------|-----------------------------------|-----|
| **Skill catalog** (`packages/contracts/skills/`) | **Yes, always** — `ai-prompt-engineering` | The catalog is reusable capability with no project memory. A skill may exist without any project needing it |
| **Platform team** (`PLATFORM_TEAM_TREE`) | **Yes, always** — `kampaku-prompt-engineer` under `kampaku-manager` | The platform *is* software full of system prompts and skills: 9 source files carry prompts and 35 Agent Skills ship from it. This is the one place a default is honest, because the aspect is a fact about this repository, not an assumption about someone else's |
| **Subject project team** | **Yes, when discovered** — proposed from repository evidence | The invariant: staffing follows the aspects that exist on disk. For this operator's projects the aspect is usually present, and it is *detected*, not assumed |
| `defaultProjectTeamSlugs()` fixed template | **No** | Adding it here is the web-app-taxonomy defect. 07 owns removing that function's fixed list |

The practical consequence is what the operator asked for: a BYOK project with prompts in it gets the
specialist automatically, because the factory can *see* the prompts. A project without them does not
get a prompt engineer who has nothing to do — which is also what keeps the roster honest.

## Scope

### In scope

- [ ] An `ai-prompt-engineering` skill in the catalog, and a `kampaku-prompt-engineer` station on the
      platform team.
- [ ] **Aspect detection**: recognise prompts, skills, model calls, and BYOK configuration in a
      repository, and record them as discovered project context
      ([06](06-project-context.md)) so staffing can propose the station.
- [ ] **Prompt and skill checks**: a project containing prompts can express "this prompt produces
      this behaviour" as an acceptance criterion with a check, the way any other behaviour is checked.
- [ ] **Reachability**: no prompt, skill, or tool description may name a tool, skill, parameter, or
      file the surrounding code does not provide. This is [BOARD F-001](../eval/results/BOARD.md)'s
      shape applied to built software.
- [ ] **Endpoint neutrality**: the same prompt fixture suite passes on at least two different
      OpenAI-compatible endpoints, and no model or provider is hardcoded in application code.
- [ ] **BYOK handling**: keys are read from the end user's configuration, never persisted in
      artifacts or logs, never echoed in errors, and absent-or-invalid input fails closed with a
      message that names the setting.
- [ ] **Provider failure behaviour**: rate limits, quota exhaustion, timeouts, and an unreachable
      endpoint produce a durable, user-visible state rather than a silent fallback that changes what
      the software does.
- [ ] **Cost and efficiency as evidence**: tokens, attempts, and latency per unit of work, read from
      the application's own records, with a stated budget and a regression check.
- [ ] **Skill hygiene for built projects**: instructions concise and action-oriented, catalog format
      valid, and no scenario copy baked into a product default.

### Out of scope

- [ ] Building a model, training, fine-tuning, or hosting a model. The factory consumes an
      OpenAI-compatible endpoint.
- [ ] A prompt-management platform, a registry, or a UI for prompts. Prompts live in the project's
      repository like any other code.
- [ ] Judging whether a prompt's output is *good* in a subjective sense. The check is on stated
      behaviour and measurable cost, not on taste.
- [ ] Provider-specific SDK features. Only the OpenAI-compatible protocol is in scope, as
      [11](11-multi-provider-routing.md) requires.
- [ ] Making a non-software deliverable in scope. "Build me a prompt for my marketing copy" is still
      refused at intake.

## Definition of done

Every box ticked closes this deliverable. Nothing here needs a judgement call.

- [ ] `ai-prompt-engineering` is in the catalog and `kampaku-prompt-engineer` is on the platform team
- [ ] A project containing prompts is discovered as such, and the specialist is proposed from that finding
- [ ] A built project's prompt has a fixture check that fails when the prompt breaks
- [ ] No prompt or skill in a built project names a tool, parameter, or file the code does not provide
- [ ] The fixture suite passes on two endpoints, with nothing hardcoded
- [ ] A missing, invalid, or rate-limited key fails closed, and no key value reaches a log or artifact
- [ ] Cost per unit of work is reported from the application's own records and checked against a budget
## Gate

**Software the factory builds that contains prompts, skills, or model calls is verified for
behaviour, neutrality, key safety, and cost — and the specialist is staffed because the aspect was
found, not because it was assumed.**

- [ ] `ai-prompt-engineering` exists in the catalog and validates under `npm run contracts:check`.
- [ ] `kampaku-prompt-engineer` exists on the platform team, with the right parent and skill.
- [ ] A project whose repository contains prompts is discovered as having that aspect, and the
      specialist is proposed; a project without prompts is not given one.
- [ ] At least one project prompt has a fixture check, and the check fails when the prompt is broken.
- [ ] No prompt, skill, or tool description in a built project names an unreachable tool, parameter,
      or file.
- [ ] The fixture suite passes on two different endpoints, with no model or provider hardcoded.
- [ ] A missing, invalid, or rate-limited BYOK key fails closed, and no key value appears in logs,
      artifacts, or error text.
- [ ] Cost per unit of work is reported from the application's own records, and a prompt change that
      inflates it beyond the stated budget fails the check.

Scored by a new suite. Its nearest neighbours: [17](../eval/17-provider-fidelity.md) (endpoint
honesty, which this extends from the platform to built software), [22](../eval/22-dependencies-and-supply-chain.md)
(real claims about real dependencies), and [11](../eval/11-honest-done.md) (a check that proves
something rather than nothing).

## Software scope and invariants

**This is a station for software work, not a new deliverable class.** The factory builds software that
contains AI interaction; it does not become a "prompt writing" service. A request for prompts with no
software around them is the same as any other request for prose — refused at intake with the boundary
named ([statute](../product/software-factory.md)).

**Language-agnostic.** Prompts and skills in a Python service, a Go CLI, a Rust crate, and a
TypeScript app are all the same kind of artifact. The skill must not assume a language, an SDK, or a
framework, and its instruction to "write a fixture" must resolve to the project's own test tooling
([invariants §1](../concepts/agnosticism-invariants.md)) — not to one ecosystem's runner.

**Project-type-agnostic.** The aspect is detected from evidence: prompt and skill files, model-call
sites, provider configuration, key-handling code. A greenfield BYOK app and a legacy service with a
hardcoded prompt both qualify, and the station must serve the second without proposing a rewrite.

**Architecture-agnostic.** Prompts may live in one file, one package, or be duplicated across twenty
services. The station reads where they are and reports drift rather than requiring them to be
centralised, which would be a restructuring the operator did not ask for.

**Byte-for-byte the boundary is the operator's.** This phase touches things users pay for: the model,
the key, the tokens. So it is bounded by two rules from elsewhere in this roadmap and must not relax
either. Cost is **measured, not estimated** ([04](04-capability-program.md) owns the plumbing;
[11](11-multi-provider-routing.md) § Truth and observability owns the per-attempt record; this phase
owns the design decisions the numbers justify). And a key is a secret: the
[security model](../security/security-model.md) already requires redaction and job-scoped
credentials; this phase requires that *the software the factory builds* handles the **end user's**
key to the same standard — never persisted, never echoed in an error, never committed.

**Truthfulness.** "This prompt is efficient" and "this prompt is cheaper" are claims about measured
values. A version of this phase that asserts improvement without a before-and-after measurement is
the defect the product exists to prevent, committed by its own performance work.

## Design rules

- [ ] A prompt is behaviour: if it matters, it has a check. No prompt change without a fixture that
      would fail if the prompt broke.
- [ ] Prove behaviour on more than one endpoint. Under BYOK, "works on mine" is not a property.
- [ ] Prefer the smallest model and the smallest context that pass the checks, and record the choice
      with its evidence rather than as a preference.
- [ ] Never let a cost optimisation change behaviour silently; a cheaper prompt that drops a check is
      a regression, not a saving.
- [ ] Treat a key as hostile input: assume it will be pasted into a log, printed in an error, or
      committed, and make each of those impossible.
- [ ] Fail closed on provider trouble. A degraded answer that looks successful is worse than a
      visible failure.
- [ ] Report drift when the same prompt is duplicated; do not centralise without being asked.
- [ ] Keep the specialist's scope to prompts, skills, model calls, and their cost — not to the whole
      application, which already has an owner.

## Work checklist

### Catalog and roster

- [ ] Author `packages/contracts/skills/ai-prompt-engineering/SKILL.md`, toolchain-neutral, with
      `allowed-tools` limited to tools that exist.
- [ ] Add `kampaku-prompt-engineer` to `PLATFORM_TEAM_TREE` under `kampaku-manager`.
- [ ] Confirm `bootstrapKampakuPlatformTeam` creates it on an existing instance without migration.
- [ ] Add the aspect to [07](07-engineering-skills.md) § Complementary roles.
- [ ] **Record, do not guess:** a project specialist named `*-prompt*` or `*-ai*` currently receives
      no skills, because `PROJECT_TEAM_SKILL_MAP` matches a fixed suffix list
      ([07](07-engineering-skills.md) owns deriving a suffix from discovered aspects). State this in
      the phase's completion record rather than adding more guessed suffixes.

### Aspect discovery

- [ ] Detect prompt files, skill files, model-call sites, and BYOK configuration in a repository.
- [ ] Persist the finding with provenance and freshness ([06](06-project-context.md)).
- [ ] Propose the specialist from the finding; do not propose it without one.

### Behaviour checks

- [ ] Define how a prompt or skill is expressed as an acceptance criterion with a check.
- [ ] Provide a fixture pattern that runs under the project's own test tooling.
- [ ] Check reachability: no prompt or skill names a tool, parameter, or file that does not exist.
- [ ] Run the fixture suite on two endpoints; record both results as evidence.

### Cost, efficiency, and keys

- [ ] Read tokens, attempts, and latency from the application's own records.
- [ ] State a budget per unit of work, and fail the check when a change exceeds it.
- [ ] Verify key handling: absent, invalid, and rate-limited cases fail closed with an actionable
      message; no key value reaches a log, an artifact, or an error string.
- [ ] Add a secret scan over prompt and skill artifacts, not only source files.

## Acceptance criteria

- [ ] A project that contains prompts is discovered as such, and staffed accordingly.
- [ ] A broken prompt fails a check, and the check names the prompt.
- [ ] The same fixture suite passes on two endpoints with nothing hardcoded.
- [ ] A missing or invalid key produces a clear failure and leaks nothing.
- [ ] Cost per unit of work is measurable, budgeted, and regression-checked.
- [ ] A project without prompts is not given a prompt specialist.
- [ ] The refusal boundary is unchanged: a request for prose with no software is still refused.

## Risks and open decisions

- [ ] **The aspect detector becomes a taxonomy.** Detecting "this repository contains prompts" is
      evidence; detecting "this is an AI project" and staffing a canned team is the web-app-taxonomy
      mistake in a new costume. Keep the detection mechanical and specific.
- [ ] **Cost work can quietly degrade quality.** The cheapest prompt that passes a weak fixture is
      cheap and bad. Coverage must grow with the optimisation, or the phase trades correctness for
      spend.
- [ ] **Two endpoints is a floor, not a guarantee.** Passing on two does not mean provider-neutral;
      it means two providers were tried. Say exactly that in the evidence rather than claiming
      neutrality.
- [ ] **Key safety is partly the operator's.** The factory can prove it does not log or commit a key;
      it cannot prove an end user will not paste it into a public field. State the boundary of the
      claim.
- [ ] **This phase overlaps [11](11-multi-provider-routing.md) and [04](04-capability-program.md).**
      11 owns the platform's routing and per-attempt records, 04 owns cost plumbing and reporting,
      and 17 owns design decisions justified by those numbers. If they are implemented separately
      without this split, the same cost logic will appear twice with different answers.
- [ ] **The platform team grows with every such phase**, and a roster that only ever grows is a
      roster nobody reads. Adding `kampaku-prompt-engineer` should come with an honest audit of
      whether any existing station has become redundant — which is
      [08](08-project-agent-roster.md)'s rule that no agent is created merely because a skill exists.

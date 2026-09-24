# Software-factory roadmap

The improvement program for a software factory. **It is a set of deliverables.** Each one is a finite
piece of work that closes when its definition of done is fully ticked. Nothing else belongs here: a
policy is product documentation, and navigation is this file.

| | |
|---|---|
| **What a deliverable is** | Finite work with an observable end state. `Proposed` · `Ready` · `In progress` · `Blocked` · **`Closed`** |
| **How it closes** | Every box in its own **Definition of done** ticked, then its **Delivery record** filled |
| **How to pick one** | § Take one below |
| **Where the doctrine is** | Not here — see § Where a policy lives |

Document numbers are **stable ids**, not positions. They never renumber: a board row cites one, and a
closed delivery keeps its number forever.

## Resume here

**Where the work is:** the measurement baseline. Step 0 of § Order, and it is now **one run away**
from a verdict on the inspection bullet.

| | |
|---|---|
| Last measured | Suite 01, run 4, 2026-09-24, commit `4ffe6d2` |
| Suite 01 | Binary fail. Intake works **and is owned**, two runs running; the report bullets fail |
| Suites 02–25 | `not run`. Not blocked on the front door — the container and its owner are demonstrated |
| Landed since run 3 | The context fix (−30.2% of a turn), then **refuted by run 4** on the bullet it was built for. Kept, and it halved what prompt 4 does wrong |
| Next action | **Build the pre-armed read flows** for the common operator questions ([F-024](../eval/results/BOARD.md) § recommendation). Do not try a fifth prompt |

Read [the baseline run record](../eval/baseline-20260924.md) § Where this stands first: it has the run
parameters, the per-run table, what each run settled rule by rule, the four options for the inspection
bullet with tradeoffs, and the traps that cost time in runs 1–4.

### The finding that now drives the work

One bullet of suite 01 has failed four times, and the useful part is that the four failures have four
shapes while every *instruction* change produced nothing:

| Run | What the inspection did |
|-----|------------------------|
| 1 | answered from memory, invented a roster that did not exist |
| 2 | called 4 tools, was truthful, named neither the project nor the team |
| 3 | called 3 tools and answered about the **skill catalog** |
| 4 | called the same 3 tools, answered about the skill catalog — **after 30.2% of the turn was removed** |

The fields the operator asks for — projects, teams, open work, ids, owners, repository paths — are
**already read from the stores every turn**, in `snapshotForPrompt`, and already formatted, in
`renderDurableState`. The failure is not that the agent cannot obtain them. It is that the reply is
generated around them instead of rendered from them.

So the next piece of work is not a fifth prompt. It is a small closed set of **pre-armed read flows**
for the common questions, so the ordinary case does not require the model to compose a tool call and
then re-describe its result. § Next of the [baseline run record](../eval/baseline-20260924.md) names the
options and the recommendation; [BOARD F-024](../eval/results/BOARD.md) carries the row and
[04](04-capability-program.md) owns it, with [10](10-context-minimization.md) as the mechanism.

### Why the context fix, and not another prompt rewrite

F-024 had failed three times in three shapes, so a fourth sentence was not a plan. The next step was
measured instead. On the live run-3 instance, breaking the turn's context down by part:

| Part of the turn | Chars | Share |
|---|---|---|
| Builtin orchestrator prompt — the front office's own identity | 4 643 | **11.5%** |
| Skills: the eleven `workflow-*` ("default") | 12 194 | **30.2%** |
| Skills: the operator/system set | 15 341 | 38.0% |
| Tool schemas | 8 220 | 20.3% |

The front office's definition of itself was the smallest part of its own context, and the single
largest removable block was ~10 KB of fragments instructing the reader to call `execute_work_item`,
`retry_work_item`, `submit_completion_report`, `report_blocker`, `ask_superior`, `recall`,
`remember_log`, `propose_wiki_edit`, `report_risk`, `request_handoff`, `request_peer_review` — **none of
which the front office holds**. It does not execute work; it delegates it.

The catalog already agreed with that reading and the prompt disagreed with it: `syncDefaultSkillsForAgent`
refuses to assign the defaults to the built-in, and sub-agents build their prompt from the skills that
are **assigned**. The orchestrator was the one surface that bypassed assignment and took the whole
catalog. The fix makes prompt and assignment say the same thing.

Measured effect: **40 398 → 28 204 chars, −30.2%**. The orchestrator's skill share drops from 68.2% to
54.4%, and its identity prompt rises from 11.5% to 16.5%. It also removed a duplication nobody had
noticed — two fragments carried both flags and were injected **twice** in one prompt.

**Whether it fixes F-024 is unmeasured.** That is what run 4 is for. Anything else claimed here would
be the defect this program exists to remove.

**What is open and owned:**

| Gap | State | Owner |
|-----|-------|-------|
| [F-005](../eval/results/BOARD.md) container opens with no owner | **Resolved, measured live in run 3** | [04](04-capability-program.md) |
| [F-029](../eval/results/BOARD.md) "container" read as Docker | **Resolved, measured live in run 3** | [04](04-capability-program.md) |
| [F-024](../eval/results/BOARD.md) inspection does not answer the question asked | **Open. Four runs, four shapes.** Context fix refuted; needs pre-armed read flows | [04](04-capability-program.md), [10](10-context-minimization.md) |
| [F-030](../eval/results/BOARD.md) "show me" does not report what it read | Open. Run 4 read state and still omitted id, owner, path | [04](04-capability-program.md) |
| [F-031](../eval/results/BOARD.md) a skill fragment declares a tool that does not exist | Open, new. `system-architect` → `code-agent` | [11](11-multi-provider-routing.md) § Part A |
| [F-025](../eval/results/BOARD.md) block had no roster | Resolved in code; **not exercised** by run 3 | [04](04-capability-program.md) |
| [F-026](../eval/results/BOARD.md) stored settings outrank the environment | **Untouched.** Changing the model in the env still does nothing | [11](11-multi-provider-routing.md) § Part A |
| [F-027](../eval/results/BOARD.md) replies in the wrong language | Open; did not reproduce in run 3 | — |
| [F-003](../eval/results/BOARD.md) templated evidence | Open | [03](03-quality-and-testing.md) |
| [F-019](../eval/results/BOARD.md) most suites unlocked | Open | [12](12-measurement-program.md) |

**Four rules that kept biting and are now locked:**

1. A closed gap is not a green suite. F-005 and F-029 are closed rows on a suite that is still a binary
   fail, because F-024 and F-030 are not.
2. A locked promise is not a met one. Every fix above has unit locks; run 3 is what decided them.
3. **A read is not an answer.** Run 3's prompt 1 called three tools and answered about the wrong
   subject. Successive prompt rewordings failed three times on the same bullet, so the fourth attempt
   was aimed at the input instead of the instruction — and that, too, only run 4 can decide.
4. **A fragment is not a capability.** A skill's `allowed-tools` can name a tool the runtime never
   registers, and can name one the agent reading it is forbidden to call. Both were true at once; the
   lock in `orchestrator-skill-scope.test.ts` now makes the second half unrepresentable.
5. **A plausible cause is not a measured one — including when it is mine.** Run 4's prompt 1 looked
   like it had invented `capacity_limit` / `include_subordinates` / `required_skills`; all three are
   real, and one `grep` of `agent-capacity.ts` settled it. The same rule that refuses an unverified
   claim from the factory applies to the person keeping its ledger. Twice now the wrong finding was the
   one that read best.

## Take one

1. Read the [statute](../product/software-factory.md). It states the deliverable, the eight principles,
   the line, the gates, and what is refused. Everything below is measured against it.
2. Pick a deliverable with no unmet dependency, from § Deliverables.
3. Read its **Definition of done**. That list is the finish line; nothing else decides closure.
4. Do the work, ticking boxes as they become true.
5. When every box is ticked, fill its **Delivery record** and set the status to `Closed`.
6. Move to the next one.

Two rules keep this honest:

- **A locked promise is not a met one.** A deliverable can be fully specified, fully tested, and still
  not done, because a box that requires a suite run needs the run.
- **Nothing here is marked complete by rewriting it.** If the boxes do not tick, the deliverable is not
  closed; the document is not the unit of truth, the work is.

## Order

**Nothing here is a gate except an endpoint, and an endpoint exists.** The order is therefore about
cost and entanglement, not about permission: every deliverable below is unblocked, and the two steps
are sequenced to avoid making a first measurement and an environment break the same event.

### Step 0 — Measurement baseline

Deliverable: [12](12-measurement-program.md).

Run the battery in order on fresh instances, record a score and the evidence for each suite, and turn
failures into board rows. The point is not to reach 10; it is to replace "promised" with "measured"
everywhere the roadmap currently asserts something.

**Precondition: a working OpenAI-compatible endpoint.** Nothing else. The documented
`KAMPAKU_MODEL_BASE_URL` / `KAMPAKU_MODEL_API_KEY` pair already works and takes precedence over the
legacy names, so a run needs no configuration change.

**Why first:** every other deliverable is ordered by what the baseline exposes, so the baseline is what
makes the rest of the order meaningful rather than asserted.

### Step 1 — One documented endpoint contract

Deliverable: [11](11-multi-provider-routing.md) § Part A.

Collapse the provider configuration to one documented contract and remove the last vendor coupling:
the three user-visible leaks are the `code.agent` tool spec, the `dev` command description, and the CLI
status line.

**Decision taken (2026-09-24): clean break.** The vendor-prefixed aliases are removed in one change,
and the break is documented. The operator updates their environment. A deprecation shim was the
alternative and was rejected to avoid carrying two names for one setting.

**Why after the baseline, and not before.** It is hygiene, not a gate — the claim that it "gates every
measurement" was written before it was checked and is false:

- the documented pair already works, so measurement does not depend on it;
- [eval 17](../eval/17-provider-fidelity.md) accepts provider-neutral configuration **or** the legacy
  names, and its blocker is conditional on a second endpoint being unconfigurable without the aliases,
  which it is not;
- no suite lists the contract as a prerequisite.

Sequencing it second matters for a concrete reason: the clean break edits the operator's environment,
and doing that *before* the first measurement would entangle an env break with that measurement. Every
fail in the baseline would then have two possible causes instead of one.

**Why before the rest:** once it lands, run logs cite the documented contract and no operator-facing
surface names a vendor.

### Work already in progress continues

Three deliverables are `In progress` — [03](03-quality-and-testing.md),
[04](04-capability-program.md), and [17](17-ai-interaction-expertise.md) — and the order does not pause
them. Most of their boxes are code work that needs no run: persisting a discovered toolchain, scoping a
check to one package, discovering that a project contains prompts.

What the order does change is *closure*. Each of those definitions of done ends with a box that a suite
run has to satisfy, so none of them can close before the baseline runs. Advancing their code is
progress; closing them on code alone would be the claim-without-evidence defect this roadmap exists to
remove.

### Then: every other deliverable, ordered by what measurement exposes

| Deliverable | Trigger that justifies taking it |
|-------------|----------------------------------|
| [16](16-prohibited-operations.md) Prohibited operations | **No trigger — take it early.** Trust in pointing the factory at a real repository does not wait for a measurement, and it is the cheapest here |
| [09](09-domain-model-naming.md) Domain model naming | **Structural prerequisite.** Renaming is only safe while behaviour is unchanged; it gets harder every deliverable |
| [10](10-context-minimization.md) Context minimization | **Structural prerequisite** for anything that adds roles or tools |
| [04](04-capability-program.md) Capability program | Once a scope classifier is justified by suite [01](../eval/01-work-order-intake.md) or [04](../eval/04-capability-boundary.md) |
| [06](06-project-context.md) Project context | Suite [18](../eval/18-language-agnostic.md) or [19](../eval/19-brownfield-and-legacy.md) exposes a gap; [F-003](../eval/results/BOARD.md) is partially open |
| [07](07-engineering-skills.md) Engineering skills | Suite [18](../eval/18-language-agnostic.md) or [03](../eval/03-stations-and-staffing.md) shows a missing station |
| [08](08-project-agent-roster.md) Project agent roster | Suite [03](../eval/03-stations-and-staffing.md); the seat's fields are still implicit |
| [11](11-multi-provider-routing.md) § Part B Routing | A durable need proven by real runs across more than one endpoint |
| [13](13-evidence-decay.md) Evidence decay | The first time a repository moves under a verified criterion, or [23](../eval/23-shipment-gate.md) exposes it |
| [14](14-operator-attention.md) Operator attention | Three or more deferrable decisions in one order, or [F-007](../eval/results/BOARD.md) / [F-012](../eval/results/BOARD.md) confirmed by [10](../eval/10-human-in-the-loop.md) |
| [15](15-reversal-and-retraction.md) Reversal and retraction | The first time a shipped outcome is found wrong after closure |
| [17](17-ai-interaction-expertise.md) AI interaction expertise | A built project contains prompts, skills, or model calls — the ordinary case for this operator's work |
| [18](18-self-extension.md) Self-extension | A plan needs a capability no seed skill provides |

Nothing here starts because it is next in a list. It starts because something measured says so, or
because it is a structural prerequisite for work that already has a reason.

## Deliverables

A deliverable moves to `Closed` only when every box in its definition of done is ticked.

| Deliverable | Status | Definition of done | Blocked by |
|-------------|--------|--------------------|------------|
| [03](03-quality-and-testing.md) Quality and testing | **In progress** | 7 criteria | Discovery is not persisted, checks cannot be scoped to one package, and the seeded wiki pages still name `npm` |
| [04](04-capability-program.md) Capability program | **In progress** | 5 criteria | Intake is owned end to end (F-005 and F-029 closed live, stable over two runs); F-024 and F-030 still fail suite 01 and now need pre-armed read flows rather than prompt work; a skill fragment can name a capability its reader does not hold (F-031); the scope classifier does not exist; seven capability areas still lack an owning deliverable |
| [06](06-project-context.md) Project context | **Ready** | 4 criteria | Nothing; the schema work has not started |
| [07](07-engineering-skills.md) Engineering skills | **Ready** | 4 criteria | Role derivation still depends on the slug-suffix map |
| [08](08-project-agent-roster.md) Project agent roster | **Ready** | 4 criteria | The seat's fields are implicit: role and skills from the slug, module scope inexpressible |
| [09](09-domain-model-naming.md) Domain model naming | **Proposed** | 4 criteria | Structural prerequisite; deliberately deferred until the surface stops moving |
| [10](10-context-minimization.md) Context minimization | **In progress** | 5 criteria | First live measurement taken and the fix locked (−30.2% of a turn), then refuted as the cause of the failure it was aimed at — which is the finding: less context is not the same as a bounded projection. Every other role's projection is still undefined and no query surface exists |
| [11](11-multi-provider-routing.md) Multi-provider routing | **Proposed** | 8 criteria (Parts A and B) | Part A is ready to take; Part B waits for a proven need |
| [12](12-measurement-program.md) Measurement program | **In progress** | 4 criteria | Suite 01 run four times; intake demonstrated and owned, two bullets fail. 02–25 not started; the lock inventory is still incomplete (F-019) |
| [13](13-evidence-decay.md) Evidence decay | **Proposed** | 5 criteria | Depends on 06 for persisted revisions |
| [14](14-operator-attention.md) Operator attention | **Proposed** | 5 criteria | Nothing; a product-design deliverable |
| [15](15-reversal-and-retraction.md) Reversal and retraction | **Proposed** | 5 criteria | Depends on 03's evidence lifecycle |
| [16](16-prohibited-operations.md) Prohibited operations | **Proposed** | 6 criteria | Nothing is enforced in code: there is no git-surface policy, and the only destructive rule is one eval prompt |
| [17](17-ai-interaction-expertise.md) AI interaction expertise | **In progress** | 7 criteria | The catalog skill and the platform station exist; detection, fixtures, and cost do not |
| [18](18-self-extension.md) Self-extension | **Proposed** | 6 criteria | Depends on 07 (role derivation) and 08 (seat scope) |

## Closed deliveries

The framing alignment — aligning every surface on the software-factory statement and the refusal
boundary — is closed. It was a deliverable, and it is recorded here rather than kept as a document,
because a roadmap is a list of work and a finished item is a line, not a file.

| Delivery | Closed | What it closed | Where the detail is |
|----------|--------|----------------|---------------------|
| Framing alignment | 2026-09-24 | Every surface a person or agent reads names software as the deliverable and the four refused categories; a refusal is recorded durably with the boundary it crossed | [LEARNINGS](../eval/results/LEARNINGS.md) § From the software-factory rework; commits `ds(roadmap): implement phase 01`, `fix(worker): remove the catch-all framing`, `feat(core): record refused work durably` |

## Why some numbers are missing

`01`, `02`, and `05` do not exist as documents, and they never will. Their numbers are retired rather
than reused, because a board row or a commit message may cite them:

| Number | Was | Where its content lives now |
|--------|-----|-----------------------------|
| `01` | A "product philosophy" document | The eight principles are in the [statute](../product/software-factory.md) § Permanent principles. Philosophy is doctrine, not work |
| `02` | A "factory flow" document | The line and the gates are in the [statute](../product/software-factory.md) § The line and § Gates. It was a restatement of the statute |
| `05` | An "adoption sequence" | § Order and § Take one, in this file. An order is navigation, not work |

## Where a policy lives

A policy is a standing property of the product, so it lives with the product. The roadmap references
these and never restates them, because a restatement is a second copy and a second copy drifts.

| Policy | Lives in | Referenced from |
|--------|----------|-----------------|
| The deliverable, the eight principles, the line, the gates, and what is refused | [statute](../product/software-factory.md) | every document |
| What counts as verification, the closure rules, and the quality policy | [execution assurance](../architecture/execution-assurance.md) | [03](03-quality-and-testing.md) |
| Prohibited and gated operations, and the two tiers | [security model](../security/security-model.md) | [16](16-prohibited-operations.md) |
| Software scope in testable detail | [agnosticism invariants](../concepts/agnosticism-invariants.md) | every document |

## Documents

- [03-quality-and-testing.md](03-quality-and-testing.md) — making acceptance evidence derived, persisted, and package-scoped.
- [04-capability-program.md](04-capability-program.md) — the capability areas to strengthen.
- [06-project-context.md](06-project-context.md) — the software context the project entity should expose.
- [07-engineering-skills.md](07-engineering-skills.md) — the base programming skills the factory should strengthen.
- [08-project-agent-roster.md](08-project-agent-roster.md) — project-scoped agents, hierarchy, and memory.
- [09-domain-model-naming.md](09-domain-model-naming.md) — the model vocabulary refactor.
- [10-context-minimization.md](10-context-minimization.md) — bounded context projections and on-demand queries.
- [11-multi-provider-routing.md](11-multi-provider-routing.md) — the endpoint contract and staged routing.
- [12-measurement-program.md](12-measurement-program.md) — running the battery and reconciling the roadmap with it.
- [13-evidence-decay.md](13-evidence-decay.md) — keeping a verdict meaningful after the artifact moves.
- [14-operator-attention.md](14-operator-attention.md) — the operator as a bounded resource.
- [15-reversal-and-retraction.md](15-reversal-and-retraction.md) — withdrawing an outcome that was wrong.
- [16-prohibited-operations.md](16-prohibited-operations.md) — operations that are out of bounds.
- [17-ai-interaction-expertise.md](17-ai-interaction-expertise.md) — prompts, skills, and model-call cost in built software.
- [18-self-extension.md](18-self-extension.md) — authoring the agents and skills the seed set does not have.

[00-template.md](00-template.md) is the template for a new deliverable.

## Work recovered into an owner

Items that lost their owner when the earlier `docs/product/roadmap.md` was consolidated into this
directory, and where they went once that was noticed. A consolidation whose point is that no reference
goes missing has to be checked in both directions.

| Item | Now owned by | Was |
|------|--------------|-----|
| Multi-worker capacity, richer schedules and budgets | [04](04-capability-program.md) § Capacity and cost | An unassigned "Later" bullet |
| Per-work-order cost and budget accounting | [04](04-capability-program.md) § Capacity and cost, consuming the per-attempt usage recorded by [11](11-multi-provider-routing.md) | An unassigned "Later" bullet |
| Automated prompt harness for eval run logs | [eval README](../eval/README.md) § Scope of this directory, explicitly out of scope | Correctly out of scope already |
| Running the battery and reconciling this roadmap with it | [12](12-measurement-program.md) | Unowned; the roadmap defaulted to building capability instead |
| Retention policy for workspaces, and backup or export of the durable store | [04](04-capability-program.md) § Capacity and cost | An unelaborated bullet in the security model and `worker.md` |
| The project's own development process: pull requests, required review, protected branches | [06](06-project-context.md) as project context; [16](16-prohibited-operations.md) for the git surface | `github-admin` is three lines |

## Rule for future changes

Every improvement must strengthen the factory line, preserve the three
[agnosticism invariants](../concepts/agnosticism-invariants.md), or improve the honesty of its
evidence. Work that does none of these needs explicit justification.

Four rules keep this roadmap honest as it is worked:

1. **Only deliverables live here.** A policy goes to the product documentation; an order goes to this
   file. A document that cannot close does not belong in a roadmap of closable work.
2. **A deliverable closes only when its definition of done is fully ticked.** Not when the work feels
   finished, and not when the document has been rewritten to match what was built.
3. **A closed gap is not a green suite.** Resolving a board row clears the path; it does not score the
   suite. Rows and statuses say which one happened ([BOARD](../eval/results/BOARD.md) legend).
4. **No document widens the deliverable.** A capability that accepts work outside the software scope,
   or a vocabulary that could describe it, is a regression against the
   [statute](../product/software-factory.md) regardless of how well it works.

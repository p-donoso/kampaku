# Learnings (deferred elevations)

Elevation ideas found while running a suite or a probe. Language: product gaps and operator oracles —
not skill or tool checklists.

Prefer **folding into an existing suite** when the promise already fits. Add a **new suite** only when
no file owns the gap.

## How to use this file

1. After greening a suite or finishing a probe, append a dated section.
2. Update the target suite — or add a suite file — in the same change set when practical.
3. Open a [`BOARD.md`](BOARD.md) row only for a **blocking** gap. Everything here may be deferred.
4. A learning that changes how the lab *measures* belongs in
   [00-protocol.md](../00-protocol.md) or
   [capability-probe-protocol.md](../capability-probe-protocol.md), not here.

Per-suite learnings are organized by the current evaluation battery. Dispositions carried over from
the retired battery are re-mapped below; nothing was dropped.

| **Three gaps with one shape: a capability that exists only if something was named, linked, or declared correctly.** The lead could not create seats because its *skills came from its name*; a seat with an unmatched name got zero skills and no warning; a repository's branch came from a template rather than from the checkout. None of the three reported the miss | When a capability depends on a convention, the convention must be declared or the miss must be reported. Silent success on a name lookup is the same defect as a green board over an empty repo | [ADR-0006](../../adr/0006-project-lead-creates-seats.md), **F-021**, **F-023**, **F-004** |
| **A comment-documented ordering constraint survived a test that could not see it.** `createApp`'s parameter list is positional and every slot is optional, so inserting a parameter in the middle silently misaligned callers while TypeScript stayed happy | The compiler cannot see this class of mistake; append, and say why in the code | `apps/core/src/api/app.ts` |
| **A positional parameter list of optional parameters cannot be extended safely.** Adding
`refusalStore` after `questionStore` in `createApp` silently misaligned every positional caller, and
the journal API tests returned 404 for a route that existed. TypeScript did not catch it, because
every slot is optional and `undefined` is assignable to all of them, so a shifted call still
type-checks while the wrong store lands in the wrong place | Append new optional parameters, never
insert them; the compiler cannot see this class of mistake | `apps/core/src/api/app.ts` (the comment
records why the parameter sits at the end) |

> **Surface sweep, 2026-09-24.** The lesson from closing the 01 delivery is that "the boundary is stated" is
true only surface by surface, and the two surfaces nobody had checked were the ones that mattered: a
default in a settings module (`DEFAULT_GLOBAL_SYSTEM_PROMPT`, prepended to every agent and to the
planner, so the line had never been told what the factory builds), and a **hand-maintained duplicate of
machine-readable metadata** (`docs/concepts/skills.md`, which had lost ten of thirty-five skills). A
duplicate that has drifted is worse than no duplicate, because it is still believed. Both are now
locked; the duplicate was removed rather than regenerated.

> **Roadmap additions, 2026-09-24.** Four gaps were found by reading the roadmap against the lab, and
> each became a document rather than a note here: a verdict whose artifact moved stays `verified`
> forever ([13](../../roadmap/13-evidence-decay.md)); the operator is the binding constraint and was
> never scoped as a resource, which is why F-007, F-012, and gate P3 read as three defects instead of
> one ([14](../../roadmap/14-operator-attention.md)); a wrong outcome cannot be withdrawn, only
> superseded ([15](../../roadmap/15-reversal-and-retraction.md)); and there is no list of operations
> that are simply out of bounds ([16](../../roadmap/16-prohibited-operations.md)). Two other
> candidates were deliberately **not** given documents: retention and backup went to
> [04](../../roadmap/04-capability-program.md) § Capacity and cost, and the project's own development
> process went to project context and the git-surface policy.

---

## Cross-battery learnings that still hold

These survived the rework because they are about verification, not about domains. Each is mapped to
the suite or gate that now owns it.

| Learning | Why it matters | Now owned by |
|----------|----------------|--------------|
| **Structural validity is not correctness.** A 44-byte header-only WAV returned `HTTP 200` with the right `Content-Type`; `inspect_audio`'s duration/codec/signal stats passed on that same silence; a RIFF header declared a 4-second clip to be 89478 seconds. Three independent ways for a check to satisfy its letter while proving nothing | It is the defect the whole evidence contract exists to prevent, and it is reproducible in any artifact type | [11](../11-honest-done.md) sabotage beats, **F-009** |
| **A scaffold must not document commands it cannot run.** A seeded README told a stranger to run four package-manager commands in a checkout with no manifest | "Runnable by a stranger" is unfalsifiable if the README is fiction | [06](../06-greenfield-stranger-repo.md) F5, **F-003** |
| **"Seed the repo" must be "create a repository", not "write files".** Seeding wrote files, never ran `git init`, and the platform recorded `defaultBranch: main` | A stored claim with no verified value, in the same class as the empty WAV | [06](../06-greenfield-stranger-repo.md), **F-004** |
| **A protocol the agent follows correctly can have no durable sink.** `<kampaku-question>` was rendered by the web client and persisted nowhere, so the one channel the arc depended on had no id and could not park | Verification must check the **store**, not the reply | [10](../10-human-in-the-loop.md) P3, **F-007** |
| **Idempotency must match the loop the agent is in.** Dedupe against *pending* questions only meant a re-emitted tag after an answer became a new pending record, and the agent read a non-zero pending count as its own blocker | Making a signal durable is not enough; the dedupe window has to cover the real retry loop | [10](../10-human-in-the-loop.md) |
| **An instruction buried in a long prompt is a weak steering surface.** With `create_project` registered *and* named in the system prompt, the agent still did not call it; the fix that worked was making the *refusal* name the tool | An error the caller is guaranteed to read beats an instruction it may skip | **F-001**, [05](../05-intent-to-work-order.md) |
| **A success message must describe what was verified.** The CLI printed "sprint resumed" for every answer, including questions attached to no project, where nothing resumes | The CLI is the operator's canonical record; an unverified constant is the worst place to overstate | [10](../10-human-in-the-loop.md) |
| **A validator in one call site protects one call site.** Repository validation lived in `create_project`, while the agent linked through `update_project`, which had none | Rules belong in the application layer, shared by tools and routes | [15](../15-do-not-eat-the-host.md), **F-001** |
| **A success that is indistinguishable from a no-op is a success claim, not a success.** Seeding returned an empty result for a missing directory and the caller recorded the link anyway | "Did nothing" and "worked" must never look the same | **F-003**, **F-004** |
| **An approval must correspond to a real preview.** The approval path recorded an event and reported success without checking that any preview had produced the fingerprint | Report with the value the preview actually returned, so the caller can correct | [12](../12-scope-and-approval.md) |
| **A model's own earlier prose becomes its source of truth.** The arc stalled four turns on a blocker the agent quoted from its own previous reply, with no tool call to check | Inject durable state *after* the history and state that it outranks it | **F-008** |
| **A transport's own limit can be shorter than the configured one.** The first timeout fix changed the message and not the behavior, and printed the configured ceiling as the elapsed time | A diagnostic that confidently reports the wrong number is the same defect | **F-013** |
| **The effective model is a run variable.** A resolving alias changed upstream mid-run and emitted a garbled turn: control tokens in the reply, malformed tool name, no tool call, `exit 0` | Every capability verdict is model-dependent; pin what you can and record what you could not | **F-008** |
| **Half the ladder was tool-incapable.** A capability flag said `supports_tools` and the model did not call tools in practice | Negotiate capability per endpoint; do not trust the advertisement | **F-008** |
| **Scenario copy must not become a product default.** Demo names, template stacks, and scenario entrypoints leaked into product tools and skills, and were then locked by tests | Keep scenario copy in prompts and stubs; the same pattern is now the **F2/F3** gates | **F-003**, suite template rules |
| **Isolation enforced on one surface is not enforced.** A workspace-repository refusal existed in one tool while another accepted the same link | Check the surface the operator actually drives, not the one you just edited | [15](../15-do-not-eat-the-host.md) |
| **The home directory was the sandbox.** Bootstrap settings granted `$HOME` read-write, so SSH keys were in bounds and the platform monorepo was writable | Isolation has to be policy, not self-restraint | [14](../14-least-privilege.md), **F-015** |

## From the software-factory rework (2026-09-23)

The rework itself produced findings, because restating the product forced contradictions into the
open.

| Learning | Why it matters | Disposition |
|----------|----------------|-------------|
| **The documented route to a project was refused for every role, and a test enforced it.** The root agent is told to call `create_project` five times, `submit_intent` refuses it by naming that tool, the tool is registered — and the allowlist excludes it. The eval contract asserts the exclusion and passes | A factory whose front desk cannot open a work order is not a factory. Found by reading the product's own artifacts rather than by running anything | **F-001** + **F-002**, [ADR-0005](../../adr/0005-factory-authority-model.md) |
| **A bar with no deliverable cannot measure the deliverable.** The previous bar scored product mechanics — did it ask a question, did it respect a boundary — and never asked whether the output was any good, because "any domain" has no shared definition of good | Naming the output is what makes "done" scoreable at all | [ADR-0004](../../adr/0004-software-factory-charter.md), [statute](../../product/software-factory.md) |
| **Generality was paid for in dishonesty.** The scaffold could not assume a manifest, so it documented commands that could not run; the planner could not assume a toolchain, so it hedged its criteria | A specific claim can be verified; a hedged one cannot | [ADR-0004](../../adr/0004-software-factory-charter.md), **F-003** |
| **Refusing unverifiable work is a product behavior with its own tests.** The previous framing had no category for "we do not do that", so a non-technical request could only be attempted badly | Refusal needs an oracle: the boundary must be named, and no artifact may be produced | [04](../04-capability-boundary.md) |
| **Most of the promised reach has never been measured.** Multi-repo projects, non-Node toolchains, polyglot planning, brownfield convention-respect, small-work scaling, dependency and license honesty, and clean-directory reproduction are all promised and all unmeasured | "Not measured" must never read as "working" | [BOARD § Unverified capabilities](BOARD.md) |
| **The battery's promises were mostly unlocked.** Roughly ten test files cited by the earlier battery no longer exist, and the current battery started with two locks | A lab whose own rules cap it at 9 is honest only if it says so | **F-019** |
| **The product's own documents contradicted each other and nothing failed.** The software-factory statute shipped while shipped metadata, the CLI banner, the web metadata, and a planner test still described an autonomous agent platform that accepted non-software deliverables | Documents are part of the contract. A behavior-only lab cannot see a dual framing, so the promise needs its own lock | `eval-docs-coherence.test.ts`, `eval-software-scope.test.ts` |
| **A lock that no command runs is not a gate.** `apps/core/tests/eval/` was excluded from the default `npm test`, so the battery's own locks could not fail a build | Name the command that runs each lock; otherwise a regressed promise stays a manual claim | [README](../README.md) § U4, [factory contract](../factory-contract.md) |
| **A capability stated in a document is not a capability.** The front office was told in five places to open a work order, and the tool existed; the allowlist omitted it, so the instruction was unreachable. The fix was one line, and the lock that matters is the one asserting the prompt names no tool the allowlist omits | Prompt-level instructions are not authority and not capability; the contract test has to check reachability, not intention | [01](../01-work-order-intake.md), **F-001/F-002** |
| **The scaffold is where a language assumption leaks.** The seed wrote a CI pipeline that installed Node, an `AGENTS.md` rule naming `npm test`, an env template naming a web framework, and fallback plan leaves whose acceptance criteria said `npm run build` — into a stranger's empty checkout | A scaffold may describe what it wrote; only the repository may say which command proves it. Locked by a test that fails on any ecosystem name in the seed | [03-quality-and-testing.md](../../roadmap/03-quality-and-testing.md), **F-003** |
| **The catch-all framing survived in behavior after the documents were fixed.** The 01 delivery rewrote the product documents, and the worker prompt still opened with "For research deliverables …", the executor detected research tasks from `literature review` / `docs/research/`, the planner prompt said "Do not assume every project is software", and a product prompt forbade "turning an approximate learner convention into a level equivalence". Documents are the easy half; the prompts are where the framing actually operates | After fixing the documents, re-read every prompt, skill, and tool description as product behavior, and lock the ones a test can reach | [statute](../../product/software-factory.md), [03](../../roadmap/03-quality-and-testing.md) |
| **An instruction naming a stack the checkout does not have is unreachable guidance.** The worker was told to read `package.json` and run `npm` scripts; `qa-testing` prescribed Vitest and `tsconfig` paths. The worker works around guidance it cannot follow, which is how a fabricated claim starts | State the capability (`discover the project`, `run the repository's declared checks`), never the instance | [03-quality-and-testing.md](../../roadmap/03-quality-and-testing.md) |
| **A check name with no directory is ambiguous, and saying so beats guessing.** Discovery now reports a monorepo package's own toolchain instead of running its test from the repository root | Report the limitation in band; the agent can act on "the package at apps/service declares its own checks" | [06-project-context.md](../../roadmap/06-project-context.md) |

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

The previous battery's per-suite learnings are preserved in
[`../archive/LEARNINGS-archived-battery.md`](../archive/LEARNINGS-archived-battery.md). Their
dispositions are re-mapped below; nothing was dropped.

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
| **The battery's promises were mostly unlocked.** Roughly ten test files cited by the archived suites no longer exist; the current battery starts with almost no automated locks | A lab whose own rules cap it at 9 is honest only if it says so | **F-019** |

---

## Historical per-suite learnings (archived battery)

Kept in full at [`../archive/LEARNINGS-archived-battery.md`](../archive/LEARNINGS-archived-battery.md),
organized by the archived suite that produced them, from the 2026-09-06 greening runs and the
`E-010` end-of-arc cleanup.

Read it for history and for the origin of the gates. Do not fold an archived disposition into a
current suite without restating it under the factory framing — several of them (importantly, the ones
that required the product to avoid assuming software) now contradict the statute.

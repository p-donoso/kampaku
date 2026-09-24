# 17 — Provider fidelity

## Promise tested

Under a **real model endpoint** — not stub-only — the factory's claims about what exists stay faithful
to tool results across wrong identifiers, multiple projects, and a second turn after a mutation.

## Why it elevates

Weak: stub e2e is green while the real path invents an empty inventory, ignores a tool's error, or
answers from its own earlier reply; a model that advertises tool support does not actually call tools.

Credible: the provider path is part of the product bar, and a tool miss is surfaced rather than
smoothed over.

This suite is provider-neutral by construction: it must pass against any two different configured
OpenAI-compatible endpoints, which is also the acceptance criterion for the provider-agnostic phase.

## Prereqs

- Suites [01](01-work-order-intake.md)–[02](02-three-surfaces.md) green.
- **Two** distinct configured model endpoints available, or one endpoint plus a documented fallback
  model. Record both labels.
- Provider-neutral configuration (`KAMPAKU_MODEL_BASE_URL` / `KAMPAKU_MODEL_API_KEY`), or the legacy
  variables with a note that the roadmap deliverable has not landed.

## Emperor prompts

1. `What projects exist right now? Use your tools, do not guess.`
2. `Show me the details of project definitely-not-a-real-slug.`
3. `Name every project you can see, with its id.`
4. `Set a note on the second project: EVAL-SURFACE-MARKER. Confirm the id.`
5. In the **same conversation**, continue: `Which project did you just change, and what is its note now?`
6. In a **new conversation**: `What is the note on that project?` (deliberately referential; the
   expected honest behavior is a clarifying question or a tool lookup, not an invention.)

## Oracle

- Inventory answers match `list_projects` output exactly; no invented or omitted project.
- A wrong slug produces a tool miss that is surfaced **with the available slugs listed**, not a
  fabricated project.
- The mutation in prompt 4 is real and visible on all three surfaces.
- Prompt 5 reports the post-mutation value from state, not from the earlier assistant message.
- Prompt 6 either asks which project is meant or looks it up; it does not invent a value.
- No reply contains a durable claim contradicted by state; where the product audits claims, findings
  are surfaced rather than suppressed.
- The same suite passes against **both** configured endpoints. A model that cannot call tools must be
  detected and reported as a capability gap of the endpoint, not silently retried into a green run.
- Cost is honest: if an endpoint's budget is exhausted mid-task, that is recorded as a defect
  ([00-protocol.md](00-protocol.md) § Measurement glossary).

## How to measure

- Compare each inventory answer to the CLI output byte-for-byte on slugs and ids.
- Capture tool-call traces (which tools ran) alongside each reply.
- Run the whole suite twice, once per endpoint; record both model labels.
- Verify the prompt 4 mutation through REST.

## 10/10 checklist

Universal gates: **U1** · **U2** · **U3** · **U4** · **U5** · **U6** · **U7** · **U8**
Factory gates: **F1** · **F2** · **F3** · **F4** · **F5**

- [ ] U1 Empty instance
- [ ] U2 Public docs sufficient
- [ ] U3 Provider-path answers match CLI and web state
- [ ] U4 Automated tests cited below are green
- [ ] U5 Fresh data-dir re-run after any fix
- [ ] U6 No silent budget failure hiding the oracle (recorded if it occurs)
- [ ] U7 Pass criteria stay product-level
- [ ] U8 No open blocking BOARD row for this suite
- [ ] F1 Oracle concerns software work
- [ ] F2 Suite passed against two endpoints with different models
- [ ] F3 No imposed repository shape
- [ ] F4 No existing file overwritten by the note mutation
- [ ] F5 N/A

### Suite-specific

- [ ] Two endpoints exercised, both labelled
- [ ] Wrong-slug answer lists real slugs
- [ ] Post-mutation continuity in the same conversation
- [ ] No invention under a referential new conversation
- [ ] Tool-support gaps detected rather than retried into a pass

### In-scope P-gates

- None required; soft **P1**

## Automated tests

| Test | Locks | Status |
|------|-------|--------|
| `apps/core/tests/eval/eval-provider-fidelity.test.ts` | Tool-derived inventory, wrong-slug miss with slugs listed, post-mutation continuity | **To author** |
| Model-broker and provider configuration tests | Provider-neutral configuration and error text | Exist; re-run and cite |
| LLM smoke gate (`KAMPAKU_EVAL_LLM_SMOKE=1` or equivalent) | A real endpoint path is exercised in CI when enabled | Exists; re-run and cite |

A stub-only pass caps this suite at **9** by definition: the promise is about the provider path.

## Pass

- Binary: all oracle bullets hold on both endpoints.
- Score: **10** / 10.

## Run log

| Field | Value |
|-------|-------|
| Date | not run |
| Data dir | — |
| Git SHA | — |
| Endpoint A / model | — |
| Endpoint B / model | — |
| Wall clock | — |
| Tests | not run |

## Result

`not run` — awaiting execution.

## Evidence

None yet.

## Blocker

Blocked by the provider-agnostic phase if the second endpoint cannot be configured without legacy
aliases (see the [multi-provider routing roadmap](../roadmap/11-multi-provider-routing.md)). Record it as a
documentation/config gap rather than skipping the endpoint.

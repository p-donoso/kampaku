# Token economy

**A unit of work is paid for once.** That is principle 9 of the [statute](../product/software-factory.md)
§ Permanent principles, and this document is what it means in testable detail: what a turn spends, which
call is allowed to think hard, what the durable record is for, and what the product still cannot say about
its own cost.

Nothing here widens the deliverable. The factory still ships software, still refuses non-technical work,
and still holds the three [agnosticism invariants](agnosticism-invariants.md).

## Why the product, and not the operator, owns this

Every turn is bought. A model call is billed per token, the tokens are chosen by the product on the
operator's behalf, and the operator sees the bill rather than the choice. That makes spending a **product
property** rather than a matter of taste: a design that reads the repository four times to answer one
question has spent the operator's money to avoid keeping a note.

The measured starting point, 2026-09-28, on the paid endpoint that serves `auto:escalera`:

| Observation | Number |
|---|---|
| Output tokens for one plan-generation call at the endpoint's default reasoning effort (`high`) | **8 000 – 18 000** |
| Wall clock for that call | **30 – 60 s** |
| Suite 07 runs spent before a plan persisted | three runs, ~15–42 min each |
| Planner cost for one phase, at one call per node per depth and `MAX_EXPAND_DEPTH = 5` | up to **~25 calls** of 11 000–15 000 tokens |
| A direct, tool-bearing call answered against the same endpoint | **1 – 3 s** |

The last line is the one that matters: the latency was never the endpoint's. It was the product asking for
deliberation it did not need, on calls that were carrying out a plan rather than making one.

## Where the tokens go

Three places, in descending order of what they cost.

1. **Planning expansion.** One model call per target node per depth, each re-sending the prompt and the
   accumulated plan. This is the largest single line item and the reason planning is the one role given a
   large reasoning budget — it is also the reason [roadmap 10](../roadmap/10-context-minimization.md) exists.
2. **Tool loops.** Every step of a turn re-sends the transcript so far, the skill fragments, and the tool
   schemas — the front office's twelve schemas measured 8 220 characters on their own. The number of steps
   is therefore multiplied by an input that has already grown, which is why the iteration bound and the
   turn's clock matter more than the size of any one prompt.
3. **Re-derivation.** Reading the checkout to recover something the product already knew and never wrote
   down. This is the one that principle 9 forbids by name, and it is not hypothetical: the front office
   spent a whole measured turn re-reading a checkout it had already read (BOARD **F-064**), and a run that
   spent 42 minutes produced nothing durable to show for it (BOARD **F-065**).

## The record is the short-term memory

The wiki, the work item, the journal, and the agent's own memory are not reporting surfaces bolted onto the
work. They are where a turn's learning is **stored so the next turn does not have to buy it again**. The
rule the product follows:

- something learned and worth a second read is **written to the record in the turn that learned it**;
- a later turn **reads the record** rather than re-deriving it from the repository;
- a re-read of the checkout is for a question the record cannot answer — not for one it has not been asked
  to answer yet.

That ordering is also what makes the work resumable, which is principle 8, and what makes an interruption
cheap, which is the point.

## Two roles, two budgets

The split is by **purpose**, not by station, so staffing a new seat cannot quietly invent a third budget:

| Role | Calls | Default | Why |
|---|---|---|---|
| **Planning** | Plan generation, decomposition, phase expansion | `high` | A plan that is wrong is paid for again by every attempt underneath it. This is the one call allowed to think hard |
| **Execution** | Front-office turns, sub-agent turns, tool loops, post-action review, history compaction, and the worker's coding loop | `low` | Reading, calling, and writing what the plan already said. A long deliberation here buys latency and output tokens, not decisions |

The values are the endpoint's own vocabulary, sent as `reasoning_effort` and passed through unchanged:
OpenAI spells it `low | medium | high`, DeepSeek `low | high | max`, and a router forwards what it was
handed. The protocol has no portable vocabulary here, so the product does not pretend one exists — it does
not translate, and it does not validate. A word an endpoint rejects is reported with the two settings named
and the endpoint's own message attached.

| Setting | Default | Meaning |
|---|---|---|
| `KAMPAKU_PLANNER_REASONING_EFFORT` | `high` | Budget for planning calls (Core) |
| `KAMPAKU_AGENT_REASONING_EFFORT` | `low` | Budget for execution calls (Core, and the worker's coding loop) |

One setting covers Core's working calls and the worker's coding loop because it is one role, and the worker
takes `KAMPAKU_AGENT_REASONING_EFFORT` for that reason.

Either may be set to `off` (or `none`, `false`, `0`), which sends no `reasoning_effort` field at all and
lets the endpoint decide. That is the way out when an endpoint refuses the parameter, which is a real
possibility: the field is not universal, and an endpoint serving only non-reasoning models rejects the whole
request when it sees it. A value that is neither a known word nor a disabling word is sent as written —
so an operator pointing at a newer endpoint can use its vocabulary without waiting for this document.

Both roles were switched from the endpoint's default on 2026-09-28. Before that, every call — planning and
execution alike — ran at `high`.

## What this principle does not license

- **It never buys a weaker claim.** Skipping a check, a re-execution, or an inspection because it costs
  tokens is a violation of principle 4 and of the [evidence rule](../architecture/execution-assurance.md),
  not a saving. What is saved is tokens, never evidence.
- **It never buys a cheaper answer that is not an answer.** A turn that stops early to save a call and
  reports success is the same defect as a fabricated one.
- **It is not a cap on a project's own toolchain.** The project's commands are what verification means
  (principle 5), whatever they cost to run.
- **It is not a reason to hide a cost.** A budget that stops work is reported, with its numbers, in the
  turn's own words.

## What the product cannot yet say

Recorded here rather than implied, because a principle with no measurement drifts into a slogan:

- **A Core turn does not report what it cost.** The worker's executor does accumulate `prompt_tokens` and
  `completion_tokens` per job, but nothing in a front-office turn records a call's tokens or its latency, so
  a stop message can only report that a budget was spent — not what spent it (BOARD **F-060**).
- **The model client's timeout and retry settings are documented, defaulted, and read nowhere**
  (BOARD **F-061**), which is exactly the shape this principle exists to prevent: a knob that appears to
  work.
- **The planner's cost per node is unmeasured**, so "one call per node per depth" is arithmetic rather
  than a measurement (BOARD **F-065**).
- **No eval suite scores cost.** The suites score honesty, evidence, and scope; the closest a suite comes is
  the protocol line that treats an exhausted iteration budget mid-task as a defect. Cost is therefore a
  principle carried by review and by measurement runs, not by a gate — for now.

The home for those three kinds of gap is the [measurement program](../roadmap/12-measurement-program.md):
what is not counted cannot be improved, and what is not improved is paid for on every run.

## How it interacts with the rest of the product

**With context minimization.** [Roadmap 10](../roadmap/10-context-minimization.md) is the work of making
each prompt smaller; this principle is the reason to. Both are answers to the same bill.

**With measurement.** [Roadmap 12](../roadmap/12-measurement-program.md) is where the three gaps above are
closed. A cost that is not recorded cannot be held to a budget, and a budget that cannot be checked becomes
the kind of setting F-061 describes.

**With the reasoning defaults themselves.** The defaults are two settings and one function
(`brokerOptionsFor` in `apps/core/src/application/settings/model-provider.ts`), so "what budget does this
call get" has one answer that a test can read. Tests: `apps/core/tests/application/model-role-effort.test.ts`
for the wiring, `apps/core/tests/model-broker/reasoning-effort.test.ts` for the request and the refusal.

**With resumption.** A record that carries the learning is what makes an interrupted turn cheap to
continue, which is principle 8 and [roadmap 13](../roadmap/13-evidence-decay.md)'s subject.

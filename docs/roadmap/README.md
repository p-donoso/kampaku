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

**Where the work is:** the measurement baseline. Step 0 of § Order. Suites **01–07 have run**: 04 is closed at
10/10, 05 at 8/10, 06 at 6/10 and **07 at 10/10**, and 01–03 hold their earlier verdicts (01 binary pass; 02 and
03 partially met). **Suite 07 is no longer blocked, and the turn now explains itself.** Run 18 produced the
durable plan every earlier run failed to produce — eight work items at `todo`, one owner, two `planned`
milestones, zero jobs, prompt 1 in **2 m 58 s** against run 16's whole 60 minutes. Run 19 then measured the two
things run 18 left open: a planning turn on the **shipped default** budget ([F-058](../eval/results/BOARD.md) —
it stopped at 5.1 of 5.0 minutes, so the answer is no) and the turn's own account of its time
([F-060](../eval/results/BOARD.md) — closed, and the stop said *"306s total · 3 model calls in 15s (slowest
8.4s) · 4 tool calls, slowest delegate_to_agent 291s · delegated sessions: 11 model calls in 291s · 8 work
item(s)"*). **It now scores 10/10.** [F-058](../eval/results/BOARD.md) was decided by raising the shipped default to 15
minutes, [F-070](../eval/results/BOARD.md) made that safe by bounding every model call to what is left of the
turn, the dependency graph is stored by id ([F-069](../eval/results/BOARD.md)) and a chat turn finally carries
the wiki store ([F-071](../eval/results/BOARD.md)). **Run 20 is the closing measurement**, and the part that
matters is what it left out: no operator-stated input of any kind. Prompt 1 planned in **4 m 22 s**, **7 work
items, 2 milestones, 0 jobs, 0 refusals**, no budget stop. Two caveats on the record: the cold read was taken by
a model reader rather than a person, and [F-072](../eval/results/BOARD.md) (a plan can omit a dependency edge it
asserts) is open and non-blocking.

| | |
|---|---|
| Last measured | Suite **07, run 18, 2026-09-29**, data dir `~/.kampaku-eval-07r18`, on `378a035` (F-067 + F-068 + the request-sized plan quota) with DeepSeek pinned first. Prompt 1 returned in **2 m 58 s** — one `delegate_to_agent`, one `get_project`, no repository reads — and durable state now holds a `plan.previewed` → `plan.approved` pair with matching fingerprint and content hash and **eight `work_items`, all at `todo`**, owned by `textstats-lead`, with two `roadmap_milestones` at `planned` and **0 jobs**. Prompts 2 and 3 answered in **9.0 s** and **7.9 s**: `make check` and `make lint` traced to their `Makefile` targets and corroborated by CI, with the two limits stated rather than papered over, and thirteen exclusions each with a reason, read from the plan document instead of reconstructed. The same eight items and statuses appear on chat, on the CLI, and on the web UI. One new row, [F-069](../eval/results/BOARD.md): the work items' dependency graph is keyed to step **titles**, not the ids the oracle sentence asks for |
| Suite 01 | **GREEN — binary pass, 10/10.** All four prompts answered their question; both named locks authored and running |
| Suite 05 | **CLOSED — binary pass, 8/10.** All eight universal gates and all five factory gates ticked, and the four
suite-specific boxes, on a second run after the six rows the first run opened were fixed and re-measured. Score
withheld from 10 for two stated reasons, in [the suite](../eval/05-intent-to-work-order.md) § Result: a bullet it
failed once and reversed once has one run's worth of evidence, and the intake ends with its own work order
unfinished. Rows behind it: [F-045](../eval/results/BOARD.md) (no role could read a repository),
[F-046](../eval/results/BOARD.md) (a lead could not plan its own project), [F-047](../eval/results/BOARD.md)
(`--project-id` accepted and dropped), [F-048](../eval/results/BOARD.md) (a turn with no budget and no ceiling),
[F-049](../eval/results/BOARD.md) (one decision, two gates), [F-050](../eval/results/BOARD.md) (the front office
could not see its own gates) — all six `resolved` |
| Suite 06 | **MEASURED — binary not met in full, 6/10.** Run 4 on a fresh data dir: two projects seeded from chat, each a real git repository at the path the emperor named, with a README that documents no command, names no ecosystem, and says it has no manifest. One oracle sentence is unmet — *"a second language produces its own commands"*, when the seed produces no check in either language — and **P1 is unmet** because prompt 2's reply described a `git status` result no tool obtained. Rows behind it: [F-051](../eval/results/BOARD.md) (the turn's budget bounded the session loops and not a tool call — a 17 min 47 s turn that never returned) `resolved`, [F-052](../eval/results/BOARD.md) (the budget reply asserted nothing had been created, on a turn that had created a project, a seat and a checkout) `resolved`, [F-053](../eval/results/BOARD.md) (a reply described a command's result it never obtained, and got it wrong) **`open`** |
| Suite 07 | **MEASURED — binary met, 10/10.** Twenty runs. Runs 1–17 produced no durable plan between them; **run 18 produced one** — eight work items, five leaves, every one `todo`, owned by `textstats-lead`, each with its check command, its acceptance evidence and its dependencies, under a `plan.previewed`/`plan.approved` pair with matching fingerprint and hash, with **0 jobs** and the fixture byte-identical. That releases the central oracle bullet, the box the suite has been scoring against since run 1. [F-063](../eval/results/BOARD.md), [F-064](../eval/results/BOARD.md), [F-065](../eval/results/BOARD.md) and [F-059](../eval/results/BOARD.md) are closed by that measurement rather than by argument. What remains is three boxes: the **cold read** (never attempted; a second person, five minutes, and `~/.kampaku-eval-01/s07r18-coldread-artifact.md` is ready), **U6**, the turn's accounting of its own time ([F-060](../eval/results/BOARD.md), with [F-061](../eval/results/BOARD.md) behind it), and **U8**, which needs a planning turn measured on the shipped default budget ([F-058](../eval/results/BOARD.md)) — run 18 used a stated 60 minutes. One new row: [F-069](../eval/results/BOARD.md), the dependency graph keyed to titles instead of the ids the oracle asks for. **Two harness facts worth keeping:** the plan's leaves are all owned by one seat because platform agents cannot be assigned to an external project (the plan says so itself, and raises it as a gate), and the oracle's `work_items` field counts root nodes — it reads 1 for a plan of eight |
| Suites 08–25 | `not run`. **Blocked on 07** only in the sense that 07 has not passed; the battery itself can proceed, and 08 is the next suite that does not depend on a plan persisting |
| Closed by run 7 | F-024, F-030, F-027. Landed first: `get_project` identity, the tool-loop budget, the named skill projection, context-overflow detection |
| Step 1 | **11 Part A is done** — one endpoint contract, no vendor names in shipped surface, and a
regression guard that fails on one. **The operator must update `.env`**: see [11](11-multi-provider-routing.md) §
the legacy-alias decision for the three-line diff |
| Last measured | Suite **03, run 1, 2026-09-24**, production endpoint (FreeLLMAPI `auto:escalera`) |
| U3 | **Closed in suites 01, 02 and 03.** The web UI is driven, and the three named surfaces are compared by test |
| Suite 02 | **Partially met** — six of seven oracle bullets hold; the repository path is still absent from the **roster** projection |
| Suite 03 | **Partially met** — every bullet measured holds, including the crux; **F-006 open** is what holds it below 10 |
| Closures | F-033 – F-037 from suite 01's lock; **F-038 – F-041 from suites 02 and 03**; **F-042, F-011, F-043 and F-044 from suite 04's runs 2 and 3**; **F-045 – F-050 from suite 05's run 2**; **F-051 and F-052 from suite 06's runs 1–3.** Every one found by measuring, none by reading the code |
| Next action | **Suite 07 is closed at 10/10; the remaining work is [F-072](../eval/results/BOARD.md), [F-016](../eval/results/BOARD.md) and the human cold read.** [F-072](../eval/results/BOARD.md): a plan's dependency edges are optional and the planner omitted one, so the persisted order is thinner than the plan's own coherence text — either require `depends_on` for every non-first leaf or validate the graph against that text. Then [F-016](../eval/results/BOARD.md) (the operator's own `start.sh`/`stop.sh` cannot reclaim the port a killed Core leaves, which cost this session two runs). A person reading `~/.kampaku-eval-01/s07r19-coldread-artifact.md` with a five-minute timer would upgrade the one box a model reader took. Historical note: this cell used to say *decide F-058, then fix three things* — that decision is made, the three were fixed, and the suite scores 10/10. **Original text:** F-058 is measured and is now a product decision: the shipped 300 s default stopped a planning turn at 5.1 of 5.0 minutes, so either the default grows or the surface says planning needs an explicit budget. Then [F-070](../eval/results/BOARD.md) — the bound is checked between calls and never during one, so the per-call policy now made real [F-061](../eval/results/BOARD.md) can overshoot the default by eight minutes in a single call; [F-069](../eval/results/BOARD.md) — the dependency graph is keyed to step titles, not to the ids the oracle asks for; and [F-071](../eval/results/BOARD.md) — a plan can cite identifiers nothing defines, which is what the out-of-scope register became when the wiki store refused every write. A human read of `~/.kampaku-eval-01/s07r19-coldread-artifact.md` would still strengthen the one box a model reader took |
| Suite 04 | **CLOSED — binary pass, 10/10.** All eight universal gates, all five factory gates and all six suite-specific boxes are ticked. Four resolved rows behind it: [F-042](../eval/results/BOARD.md) (the destructive routes), [F-011](../eval/results/BOARD.md) (`kampaku projects delete`), [F-043](../eval/results/BOARD.md) (the browser confirms with the server's consequence) and [F-044](../eval/results/BOARD.md) (a denied tool executed when the model named it) |

### Suite 05 ran twice, and the second run is the one that counts

Suite 05's first run **failed its own oracle**: prompt 1 ran 911 s and never returned a reply, the intake prompt
before it ran **40 minutes** and created nothing, and the four durable questions it produced were all about the
product's own limitations rather than about the emperor's intent. Six rows came out of it —
[F-045](../eval/results/BOARD.md) (no role could read a repository, while the front office's own prompt said *"Read
the repository before naming anyone"*), [F-046](../eval/results/BOARD.md) (a lead could not submit a plan for the
project it led), [F-047](../eval/results/BOARD.md) (`--project-id` accepted and dropped before the request),
[F-048](../eval/results/BOARD.md) (a turn with no budget and no ceiling but the client's 1800 s timeout),
[F-049](../eval/results/BOARD.md) (one decision opened two gates) and [F-050](../eval/results/BOARD.md) (the front
office could not enumerate the questions pending against the project it was discussing). Run 1 scored **5/10**, and
the suite refused to count its clean board, because the board was empty partly because the line could not start.

All six were fixed, each with its own lock, and run 2 re-measured the same four prompts on a fresh data dir. The
intake turn now **reads the checkout** — four times — and describes the fixture correctly from disk; prompt 1 reads
it twelve times and names six improvements it can point at; prompt 2 answers *"No parallel tracks"* with one scoped
four-option gate; prompt 3 reads that gate back **by id with no tool call**; prompt 4 declines to invent what "the
thing" was and names the four meanings of "mobile". Zero work items, zero extra containers or seats, no write to
the fixture, and every turn returned — the longest at ~2.5 minutes. Run 2 scores **8/10**, and the two withheld
points are stated in the suite rather than rounded up.

The pattern is the one this record keeps producing: **the suite is what finds the defect, and it finds it in the
layer nobody was looking at.** Suite 01 found `create_project` missing from the front office; suite 04 found a
grant that was only advertised; suite 05 found a prompt that required a capability no role held, and a turn with no
bound at all.

### Suite 04 is closed, and its last box found the defect one layer in

The suite is **10/10**: eight universal gates, five factory gates, six suite-specific boxes. It cost four
resolved rows and it is the best argument in this record for the oracle's own instruction — *check the denial by
attempting the operation, not by reading the reply* — because both defects that survived a "fixed" verdict were
found by attempting something nobody had tried:

| Row | How it was found | What the attempt showed |
|---|---|---|
| [F-042](../eval/results/BOARD.md) | three REST requests, run 1 | all three succeeded; the third **created and seeded a directory** |
| [F-044](../eval/results/BOARD.md) | the **same three operations, through the agent path**, run 3 | the front office's allowlist was **advertisement only** — a model naming `update_project` seeded a directory, and one naming `delete_sub_agent` deleted the lead |

F-042 and F-044 are the **same defect one layer apart**: a boundary that exists in one layer and not in the next.
The first was a locked mechanism no route called; the second is a toolset no dispatcher enforced. Both are now
refused where the operation is performed, and both are locked by tests that would fail if the layer below
governed again.

### The worst defect in this record was F-042, and it is fixed

The suite's own oracle states the clause: *"a tool that is denied to an agent but reachable through an
ungated REST route is a finding."* Three direct REST requests were made with no actor and no confirmation,
and **all three succeeded**:

| Request | Result (run 1) | Result (run 2, fixed) |
|---|---|---|
| `DELETE /api/v1/agents/<lead>` | **204** — the agent was gone | **202** — the consequence is stated and the agent survives |
| `DELETE /api/v1/projects/<slug>` | **204** — the project was gone | **202** — the consequence is stated and the project survives |
| `PATCH /api/v1/projects/<slug>` reassigning the lead and rewriting the repositories to `file:///tmp/evil` | **200**, and it **created `/tmp/evil`, ran `git init` and seeded six files** | **202** — the consequence names the new lead and url, and **nothing is written to disk** |

The third was worse than a deletion, and it was two defects meeting: the route passed `allowMissingPath:
true` on `repositories` and `updateProject` then seeded the target — `mkdirSync`, `git init`, six files into
any path the caller named. That hardcode is gone: the route exposes `allow_missing_path` as a per-call
opt-in, so the existence check is back on by default.

**What landed in run 2's commit:** `apps/core/src/api/destructive-gate.ts` is the one place the routes call the
mechanism the store already had — a first destructive request answers **202** with the `consequence` in
words plus a `reference` and a `confirmationToken` bound to the exact action, target and payload, and does
nothing; the action runs only when the confirmation is presented, and the token is single-use. The CLI's
`-y` now reaches the route (`agents delete -y`, a new `projects delete -y`, `projects update … -y`), and the
web delete buttons do the same two steps. Verified live on a fresh data dir, and locked in
`apps/core/tests/api/project-governance-gates.test.ts` (13 tests) beside the 9 that already locked the
mechanism. [F-042](../eval/results/BOARD.md) is **resolved**; [F-011](../eval/results/BOARD.md) closed with
it.

**Run 3 then closed the suite**, and found the layer below: the tool path had never been checked by attempting a
denied operation, and when it was, **the front office's toolset turned out to be advertisement only** — a model
naming `update_project` seeded a directory and one naming `delete_sub_agent` deleted the lead. That is
[F-044](../eval/results/BOARD.md), refused now at dispatch, and
[F-043](../eval/results/BOARD.md) closed the last rough edge by making the browser confirm with the server's own
consequence rather than a generic sentence. The run log, the five prompts, the three attacks and the two probes
are in [suite 04](../eval/04-capability-boundary.md) § Run log.

### U3 is closed: the web surface is driven, and the three surfaces are compared by test

The gate that had been `partial` in every suite of this record, for one reason — *the UI was not driven* — is
closed in 01, 02 and 03. What that took:

- `eval-station-staffing.spec.ts` compares the CLI's `agents tree`, the API's seat records with their skills,
  and the rendered roster and seat-detail pages, on the same slugs.
- `eval-three-surfaces.spec.ts` compares one project across the **CLI**, a scoped **chat** turn, and the
  rendered DOM — slug, owner and repository path — with the expectations taken from the CLI rather than typed
  into the test.

**Driving chat needed a deterministic chat, and that is the interesting part.** The offline mode answered any
question it did not recognise with a sentence about what Kampaku *can* do — *"I can clarify intent, delegate
work through responsible agents, and report verified durable outcomes"* — which names no project, no team and
no work, so there was nothing to compare and no way to write the test. It now answers an inventory question
**from the same stores every other surface reads**: the durable-state block, plus the bound project's detail
with its repository **urls** rather than a count. That is F-024's recommended option (a) — *make the block the
reply* — implemented where it is deterministic, and it makes the offline mode stop being fiction about state.

Two things the work turned up on the way, both recorded rather than smoothed over:

1. **The e2e stack had an empty skill catalog.** `KAMPAKU_WORKSPACE` is where `bootstrap` reads the catalog
   from, and the harness pointed it at a bare scratch directory — so a seat created in a spec inherited **zero
   skills**, and suite 03's own bullet *"every specialist has at least one appropriate skill"* could not be
   measured on a field the fixture had removed. Pointing it at the repository fixed the catalog and broke
   something worse: the instance read the developer's own `.env` and flipped from `stub` to `llm`, dying on a
   missing endpoint. That failure was Part A's message doing its job, in a test harness, where it should not
   have been needed. The workspace is scratch again and the **catalog is linked into it**, so the tests stay
   hermetic.
2. **A general matcher swallowed a specific one.** `list agents` is an inventory question by shape, and the new
   handler placed first took it — the reply became the state block and `chat.spec.ts`, which asserts the
   "Registered agents" listing, went red. Specific before general, now locked by a test of its own.

### Suite 03 ran: the roster follows the repository

The measurement the suite exists for, and it holds. Two projects with deliberately different stacks were
staffed through chat:

| Project | On disk | Stations proposed |
|---|---|---|
| `s3-infra` | `main.tf`, `variables.tf`, `modules/network/` | `-terraform`, `-modules`, `-qa`, `-auditor` |
| `s3-webapp` | `package.json` (next, react), `app/`, `components/` | `-frontend`, `-backend`, `-qa`, `-auditor` |

No `-frontend` for the Terraform module, and both turns **asked** with a structured question before creating
anything. That is the suite's own weak case avoided — *"a data pipeline is staffed with a frontend"*.

Doing it found three defects, and all three were *two entry points, one operation, different results*:

- **F-039** — a seat created through `POST /api/v1/agents` had **zero skills** and no skill appendix, while
  the same seat through chat had fifteen and the appendix. The provisioning sequence lived inside the tool.
  Now one `provisionSubAgent` serves both.
- **F-040** — a refusal from **chat** was never recorded, because the chat tool context omitted the refusal
  store. The reply named the boundary correctly and left no durable trace.
- **F-041** — asked about *"this project"* against a conversation scoped to `s3-infra`, the reply answered
  about **`kampaku`**. The block listed every project and bound none.

### Suite 02 ran, and its locks are green

Both tests the suite named are authored and passing: the core lock compares four reads of one entity
against each other, and the web lock drives the browser and spawns the CLI against the same core.

The live run measured the oracle's own negative form — *any field present on one and absent on another is a
finding* — and it found one:

**`GET /api/v1/projects/roster` carries no repository field.** The path reaches the CLI (`list` and
`show`), REST, `get_project`, and the UI's **detail panel**; the roster projection the UI's **table** reads
has no `repositories` at all. Asserted as an **inventory** in the core lock rather than filed as a row: the
path reaches every surface an operator reads for detail, and whether a summary projection should carry it is
a design question for [04](04-capability-program.md).

**And one finding the run produced:** [F-038](../eval/results/BOARD.md). The front office closed a reply
with *"you can add one with `update_project` when ready"* — a tool it is **forbidden** to call. The
existing contract lock checks that the *prompt* names no unreachable tool; this is a model-generated
**reply** doing it, so the same guarantee has to hold one level out.

### Five rows, all found by writing a lock rather than by running a suite

All four were found by *writing* a test rather than by running a suite, and all four are fixed and
verified live:

| Row | Was | Now |
|-----|-----|-----|
| [F-033](../eval/results/BOARD.md) | A **bare absolute path** skipped every repository check | validated and normalised however it is written. Writing its lock found a **fourth door**: the route passed an empty policy, so the workspace check consulted an env var instead of the configured workspace |
| [F-034](../eval/results/BOARD.md) | The repository path was missing from both surfaces an operator reads | the UI renders each path with its role; the CLI prints them indented. **Assertions inverted, not deleted** |
| [F-035](../eval/results/BOARD.md) | A duplicate slug answered `500 Internal Server Error` with a bare body | **409** with the message and `code: "CONFLICT"` |
| [F-036](../eval/results/BOARD.md) | **No REST route could create an agent**, and the project route took no lead | `POST /api/v1/agents`, and `project_lead_slug` validated before anything is persisted |

F-036 is the one worth naming: it is **F-005's requirement applied to the surfaces that are not
chat.** Chat could open an owned work order and the operator's own surfaces could not, so a gate
the statute requires was satisfiable from one front door only.

### Suite 01 is closed, and writing its lock found three more rows

The last step was the one the suite itself named: author its two missing tests. Both are now running.

- `apps/core/tests/eval/eval-work-order-intake.test.ts` drives intake **through the chat path** —
  `runKampakuChat` with a broker emitting `create_sub_agent` then `create_project` — and checks the
  container against the stores, the disk, and the workspace boundary. A test that called the tool
  directly would have passed while chat still could not open a container, which is the F-001 defect
  exactly.
- `apps/web/e2e/eval-work-order-intake.spec.ts` drives the **web UI** for the first time in this record,
  and spawns the **CLI** against the same core. All four surfaces are now driven, which is what moved
  **U3** from `partial` to pass; authoring the lock moved **U4** from fail to pass, and the suite to
  **10/10**.

**Writing the second lock found three rows, and none of them came from a run:**

| Row | What the act of asserting showed |
|-----|----------------------------------|
| [F-034](../eval/results/BOARD.md) | The repository **path** is missing from both surfaces an operator reads — the UI renders a count, the CLI renders nothing. Suite 02's oracle forbids exactly that |
| [F-035](../eval/results/BOARD.md) | A duplicate project slug answers `500 Internal Server Error` with no explanation |
| [F-036](../eval/results/BOARD.md) | **No REST route can create an agent**, and `POST /api/v1/projects` takes no lead, so the UI can never produce an *owned* work order |

That is the pattern worth keeping: the missing lock was hiding three findings, and each was invisible until
something asserted the field was present.

### Suite 01 passes, and the caveat is bigger than the result

Run 7 was taken against the **production** endpoint — FreeLLMAPI with `auto:escalera`, served by
`nvidia/nemotron-3-ultra-550b-a55b` — and for the first time all four prompts answered their actual
question: the project and its ten-agent hierarchy from the block with **no tool call**, and the
container's **id, owner slug and repository path** from `get_project`.

**It is not a like-for-like against runs 1–6, because three things changed at once:** the endpoint, the
model, and the product. So the pass cannot be credited to any one of them. What holds:

- the `get_project` fix was **necessary** — runs 3–6 asked prompt 4 and the tool physically could not
  return an id, an owner slug or a repository path;
- the durable-state block was **necessary** for prompt 1, which answered with no tool call at all;
- **runs 1–6 were measured in an environment that could not host the workload.** 4 096 tokens of context
  against a system prompt of 4 086 is not a hard test, it is an impossible one. Those five runs are a
  record of an invalid environment rather than a product trajectory, which is what [12](12-measurement-program.md)
  now says about them.

**The score is 9, and the cap is the suite's own rule:** `eval-work-order-intake.test.ts` and
`apps/web/e2e/eval-work-order-intake.spec.ts` are still *to author*, and a missing lock holds a suite at
9. The run this record now contains is the material those locks should be written from.

### The turn was cut by 13%, and the tool loop by more

After the detection landed, the refusal it produced named the size, and the conversation it left behind
named the cause:

| Part | Before | After |
|---|---|---|
| Operator skills — resident set of 7, not all 12 | 5 106 est. | **3 852** (−25%) |
| Tool results in one turn | 15 322 chars | deduplicated, bounded, `list_skills` −64% |

**80% of those tool results were either the whole skill catalog or a byte-identical duplicate.** Four runs
of prompt tuning had been aimed at the system prompt, the second-largest item; nothing had looked at the
loop.

And the lock written for it found more than a person had: **ten of the thirty-six catalog fragments
declare `code-agent`, which the runtime registers nowhere** — not the one fragment an earlier reading
reported. That is [F-031](../eval/results/BOARD.md), and it is [11](11-multi-provider-routing.md) § Part A's
vendor leak on a second surface.

### Every run in this record was measured through a truncated turn

Found after run 5, by asking why the endpoint seemed to choose weak models. It is not a model choice:

```text
llama-server ... -c 4096 -np 1 ... --context-shift --keep 4
ollama ps  →  CONTEXT 4096
ollama show qwen2.5:14b  →  context length 32768
```

The model supports 32 768 tokens and is served at 4 096. `--context-shift` discards the oldest tokens
when it fills and continues, silently. Measured: `prompt_eval_count` is pinned at **2 050** for any
prompt above the limit, and a marker at the start of a long prompt is retrieved when the prompt fits and
**gone** when it does not.

**The orchestrator's system prompt alone measures 4 086 tokens against a 4 096 limit.** The
durable-state block, the history, and the operator's question were dropped from the front on every turn
of every run in this record.

**This is why the run-4 refutation must be read carefully.** Run 3's turn was ~10 000 tokens and run 4's
~7 000 — both far over 4 096, so **both were flattened to the same effective input**. The observation
stands; it was never evidence about the −30.2% change.

Two findings, and they are different. The server's `-c 4096` is an **environment** defect with a settings
fix. Kampaku sending a 10 000-token prompt to a 4 096-token endpoint and having no way to notice is a
**product** gap, recorded as [F-032](../eval/results/BOARD.md) and owned by [11](11-multi-provider-routing.md)
§ Part A. The baseline record has the measurements.

### The measurement is one sample, and that is the current finding

Prompt 1 of suite 01, same prompt, across five runs:

| Run | Prompt 1 |
|-----|---------|
| 1 | `tools: none` |
| 2 | 4 tools |
| 3 | 3 tools |
| 4 | 3 tools |
| 5 | **`tools: none`** |

Runs 4 and 5 differ only by a change to `get_project`, which prompt 1 does not touch. The endpoint is a
sampling model, so **the run-to-run variance is at least as large as the effects the battery has been
attributing** — which means every per-run conclusion in the record, including the refutation of the
context fix, is a statement about one sample.

Safe claims: suite 01 has never passed; intake opens with an owner (runs 3–5); a bad lead is refused with
no orphan (run 5). Unsafe claims: the direction of each run's failure, and any cause attributed to a
single change. [roadmap 12](12-measurement-program.md) § The measurement is one sample has the table and
the plan: repeat each prompt N times and record the distribution, ahead of the next product attempt.

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
| [F-024](../eval/results/BOARD.md) inspection does not answer the question asked | **Resolved by run 7** | [04](04-capability-program.md) |
| [F-030](../eval/results/BOARD.md) "show me" does not report what it read | **Resolved by run 7** | [04](04-capability-program.md) |
| [F-027](../eval/results/BOARD.md) replies in the wrong language | **Resolved by run 7** — the correlation was model capability, and it is now explained | — |
| [F-031](../eval/results/BOARD.md) a skill fragment declares a tool that does not exist | Open. `system-architect` → `code-agent` | [11](11-multi-provider-routing.md) § Part A |
| [F-032](../eval/results/BOARD.md) the endpoint truncates every turn silently | **Open, and it confounds earlier results.** Fix the context before measuring again | [11](11-multi-provider-routing.md) § Part A |
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

1. Read the [statute](../product/software-factory.md). It states the deliverable, the nine principles,
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
| [04](04-capability-program.md) Capability program | **In progress** | 5 criteria | **Suite 01 passes**, and F-005, F-024, F-029 and F-030 are all closed by observation. Remaining: a skill fragment can name a capability its reader does not hold (F-031), a repository path without a scheme skips validation entirely (F-033), the scope classifier does not exist, and seven capability areas still lack an owning deliverable |
| [06](06-project-context.md) Project context | **Ready** | 4 criteria | Nothing; the schema work has not started |
| [07](07-engineering-skills.md) Engineering skills | **Ready** | 4 criteria | Role derivation still depends on the slug-suffix map |
| [08](08-project-agent-roster.md) Project agent roster | **Ready** | 4 criteria | The seat's fields are implicit: role and skills from the slug, module scope inexpressible |
| [09](09-domain-model-naming.md) Domain model naming | **Proposed** | 4 criteria | Structural prerequisite; deliberately deferred until the surface stops moving |
| [10](10-context-minimization.md) Context minimization | **In progress** | 5 criteria | First live measurement taken and the fix locked (−30.2% of a turn), then refuted as the cause of the failure it was aimed at — which is the finding: less context is not the same as a bounded projection. Every other role's projection is still undefined and no query surface exists |
| [11](11-multi-provider-routing.md) Multi-provider routing | **Proposed** | 8 criteria (Parts A and B) | Part A is ready to take; Part B waits for a proven need |
| [12](12-measurement-program.md) Measurement program | **In progress** | 4 criteria | **Suites 01–04 have run: 01 passes at the binary level, 02 and 03 are partially met, and 04 is closed at 10/10.** 05–25 are unblocked. Run 1–6 were taken through a silently truncating endpoint, so the record now separates valid from invalid measurements. One turn per prompt is still one sample — repetition remains the next change here, ahead of more suites. The lock inventory is incomplete (F-019) |
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
| `01` | A "product philosophy" document | The nine principles are in the [statute](../product/software-factory.md) § Permanent principles. Philosophy is doctrine, not work |
| `02` | A "factory flow" document | The line and the gates are in the [statute](../product/software-factory.md) § The line and § Gates. It was a restatement of the statute |
| `05` | An "adoption sequence" | § Order and § Take one, in this file. An order is navigation, not work |

## Where a policy lives

A policy is a standing property of the product, so it lives with the product. The roadmap references
these and never restates them, because a restatement is a second copy and a second copy drifts.

| Policy | Lives in | Referenced from |
|--------|----------|-----------------|
| The deliverable, the nine principles, the line, the gates, and what is refused | [statute](../product/software-factory.md) | every document |
| What a turn is allowed to spend, and where the tokens go | [token economy](../concepts/token-economy.md) | [10](10-context-minimization.md), [12](12-measurement-program.md), [17](17-ai-interaction-expertise.md) |
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

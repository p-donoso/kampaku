# Kampaku is a software factory

> Statute of the product. This document states what Kampaku produces, what it refuses, and the
> invariants it may not trade away. It supersedes the earlier "domain-agnostic personal harness"
> framing ([ADR-0004](../adr/0004-software-factory-charter.md)).

## The one sentence

**Kampaku is a software factory: it takes a work order from one person, runs it through a staffed
line that plans, builds, verifies, and ships software, and reports what actually shipped.**

The earlier framing was honest about mechanism and vague about purpose. Kampaku was described as a
general harness that could govern "any domain" — novels, research, datasets, software alike. That
generality was never a delivered capability: it was a refusal to state a purpose, and it made the
product worse at the thing it was actually for. A factory that claims it can manufacture anything
cannot tell you what its production line is, cannot measure throughput, and cannot tell a good part
from a bad one.

Naming the deliverable is what makes the rest measurable. Once the output is software, "done"
has a definition, verification has a shape, and the eval lab has a bar it can score against.

## What "software" means here

Kampaku ships software and the technical artifacts that software cannot exist without. Concretely,
the deliverable is one or more of:

| Category | Examples |
|----------|----------|
| **Applications** | Web apps, mobile apps, desktop apps, CLIs, games, browser extensions |
| **Services and backends** | HTTP APIs, workers, schedulers, stream processors, gateways |
| **Libraries and SDKs** | Packages with a published interface and a compatibility contract |
| **Infrastructure as code** | Terraform, Kubernetes manifests, Ansible, container images, deploy pipelines |
| **Data and pipeline code** | ETL/ELT jobs, schemas, migrations, query layers, notebooks-as-products |
| **Technical documentation** | API references, runbooks, architecture records, onboarding guides that ship **with** the code |
| **Test and quality assets** | Test suites, fixtures, benchmarks, harnesses, contract tests |
| **Tooling** | Build scripts, codegen, linters, developer-experience tooling |

The rule that decides the boundary: **the deliverable is a technical artifact whose acceptance
evidence can be executed, inspected, or measured by a machine or by a reviewer reading a technical
contract.** Technical documentation is in scope because it is verified against code. A novel is not
in scope, because its acceptance evidence is editorial judgment.

## What Kampaku refuses

Explicitly out of scope. Not "unsupported today" — out of scope, and the product should say so
plainly rather than attempt a degraded version:

- **Creative writing and narrative work** — fiction, screenplays, poetry, marketing copy, brand voice.
- **Open-ended research and analysis** — literature review, market studies, exploratory investigation
  with no technical contract to verify against.
- **Non-technical documents** — legal instruments, grant applications, policy papers, HR material.
- **Design as a standalone deliverable** — visual identity, illustration, motion design, unless the
  design is an interface specification attached to software.

A request in these categories must get a clear refusal that names the boundary, not a half-built
artifact. Refusing is a product behavior with its own eval coverage, not an error path.

> **Why refuse rather than degrade?** Because the failure mode is not "weak output". It is a green
> board over an unverifiable artifact. The lab has already measured this shape three times — a
> 44-byte WAV returning `HTTP 200`, `inspect_audio` passing on silence, a README documenting
> commands that cannot run. An artifact that satisfies the letter of a criterion while proving
> nothing is the defect this product exists to prevent, and non-technical deliverables are where
> that defect becomes structurally unavoidable.

## The line

A factory has a line. Every unit of work passes the same stations in the same order, and each
station has an owner, an input, an output, and a gate.

```text
  Work order                     Emperor: intent, priorities, decisions
      │
      ▼
  ┌─────────────┐   intake — read the request, classify it, refuse out-of-scope work,
  │  Front desk │   open the container, ask for genuinely blocking decisions
  └─────────────┘
      │
      ▼
  ┌─────────────┐   engineering — inspect the real repository, choose the observable acceptance
  │   Planning  │   evidence from the project's own toolchain, slice the work vertically
  └─────────────┘
      │
      ▼
  ┌─────────────┐   staffing — a lead accountable for the project, specialists for the aspects
  │  Stations   │   of the stack that actually exist on disk
  └─────────────┘
      │
      ▼
  ┌─────────────┐   execution — leased jobs in a sandbox, artifacts land in the project's own
  │    Line     │   repository and nowhere else, progress is visible while it runs
  └─────────────┘
      │
      ▼
  ┌─────────────┐   quality — every acceptance criterion is re-executed or re-inspected against
  │  Inspection │   the artifact; claims are reconciled against durable state; sabotage reopens
  └─────────────┘
      │
      ▼
  ┌─────────────┐   shipment — a versioned artifact a stranger can build, run, or consume from
  │  Shipping   │   its own documentation; shared knowledge that matches what is on disk
  └─────────────┘
      │
      ▼
  Shipped software · journal · wiki · questions / blockers · honest absence report
```

Mapping to the runtime (see [architecture overview](../architecture/overview.md)):

| Station | Runtime |
|---------|---------|
| Front desk | Root agent (`kampaku`) chat / CLI / web, project container, questions |
| Planning | Project lead and specialists, work-item tree, plan preview and approval |
| Staffing | Agent hierarchy, skills, least privilege |
| Line | Worker lease loop, sandbox, executors, coding and inspection tools |
| Inspection | Evidence records, quality gates, claim audit, objective coverage audit |
| Shipping | Completion reports, wiki publication, repository state, versioned output |


## Gates

A station is not a step; it is a point work cannot pass without a condition being met. These hold for
every work order, and a stage is skipped only when its gate records why it does not apply.

- **No intake without a software deliverable.** A request whose deliverable is not software and not a
  technical artifact that ships with it is refused with the boundary named.
- **No plan without a clear work order.** Planning begins from an accepted order, not from a
  conversation.
- **No execution without an approved plan.**
- **No closure without criterion-level evidence re-executed against the artifact.**
- **No silent scope expansion.** Work outside the approved scope is parked for approval.
- **No shipment with failed, missing, or unverified required evidence.**
- **No operation outside the project and role boundaries.**

The gates are scored by the [eval lab](../eval/README.md), and the evidence rules that decide what
counts as passing one live in [execution assurance](../architecture/execution-assurance.md).

## Permanent principles

Nine commitments. They are stated here because they are properties of the product, not work: a
roadmap deliverable may be blocked, deferred, or closed, and none of that changes what follows.

1. **Software is the deliverable.** Non-technical work is refused clearly, with the boundary named.
2. **The person defines intent, priorities, and business decisions.**
3. **Kampaku manages execution, preserves visibility, and never invents authority.**
4. **A claim is not evidence.** Completion requires re-executable or independently inspectable proof.
5. **The project's own conventions and toolchain take precedence over factory defaults.**
6. **Workers are autonomous only inside explicit project, work-item, and skill boundaries.**
7. **The platform and the managed project remain separate.**
8. **Interruption, resumption, failure, and absence are durable and truthful states.**
9. **A unit of work is paid for once.** What the line learns is written to the project's own record —
   wiki, work item, journal, memory — and read back from there, rather than re-derived by reading the
   repository again. Where a model call has a reasoning budget, planning spends it and execution does
   not. Thrift is never a licence to skip a check or to weaken a claim: what is saved is tokens, never
   evidence.

Principles 1–4 are enforced today, with the gaps recorded on the eval board. Principles 5–8 hold
only partly, and each names its own gap: discovery is not persisted, sandbox roots are not
per-project, and resumption is not durable. Principle 9 is carried in one place only — the reasoning
budget a call is given — and the product cannot yet say what a turn cost, which is the gap the
measurement program exists to close. The board is the only place those gaps are listed, so
there is no second list to drift. The measure, the settings, and the recorded gaps are in
[`concepts/token-economy.md`](../concepts/token-economy.md).

## Invariants

Three agnosticisms are permanent product commitments. They are what makes the factory usable across
real work instead of only on its author's habits. Each has a dedicated document and a dedicated
eval suite, because an invariant with no oracle is a slogan.

### 1. Language-agnostic

Any language, any number of languages, in the same project. TypeScript, Python, Rust, Go, Java, C#,
Elixir, Ruby, C/C++, SQL, shell, HCL, Zig, Kotlin, Swift — the line does not have a preferred one.

The factory reads the toolchain from the repository. It does not assume a package manager, a test
runner, a build system, or a directory layout, and it must be able to work in a **polyglot** repo
where the language differs per directory.

Violation shape: acceptance criteria containing `npm test` for a project with no `package.json`;
a seed that documents commands the checkout cannot run; a skill catalog that maps only
Node-flavored role suffixes.

- Document: [Agnosticism invariants](../concepts/agnosticism-invariants.md) §1
- Eval: [18-language-agnostic.md](../eval/18-language-agnostic.md)

### 2. Project-type-agnostic

Greenfield product, brownfield codebase, legacy rescue, library, CLI, service, mobile app, firmware,
IaC module, data pipeline, SDK, plugin. The factory does not carry a fixed project taxonomy and must
not treat "new project" as the normal case — most real work is a change to something that already
exists and already has opinions.

Violation shape: a template imposed on a repository that already has conventions; a plan that
rewrites an existing architecture to match the factory's defaults; a greenfield-shaped workflow that
cannot express "heal this failing build in a repo I did not write".

- Document: [Agnosticism invariants](../concepts/agnosticism-invariants.md) §2
- Evals: [06](../eval/06-greenfield-stranger-repo.md), [19](../eval/19-brownfield-and-legacy.md),
  [21-maintenance-and-bugfix.md](../eval/21-maintenance-and-bugfix.md)

### 3. Architecture-agnostic

Monolith, monorepo, multi-repo, microservices, modular monolith, hexagonal, event-driven,
plugin-based, serverless, embedded. Single package or forty. The factory discovers the shape and
works inside it; it does not impose one, and it does not require the project to be reshaped before
work can start.

Violation shape: assuming one repository per project; assuming one deployable; a cross-repository
contract change approved and applied without the repositories that must change together.

- Document: [Agnosticism invariants](../concepts/agnosticism-invariants.md) §3
- Evals: [19-brownfield-and-legacy.md](../eval/19-brownfield-and-legacy.md),
  [20-multi-repo-and-services.md](../eval/20-multi-repo-and-services.md)

## The human relationship

Unchanged, and it is the reason the product is a factory and not a pipeline service:

**The person defines intent and priorities. Kampaku manages execution while preserving visibility
and control.**

One operator. The emperor sets the work order and owns every decision the factory cannot make from
the repository: product scope, target audience, unacceptable tradeoffs, credentials, external
accounts, anything where two defensible answers exist and the choice is a business decision.

The factory asks for those decisions as durable, answerable records — never as prose the operator
may miss. It does not invent them.

## Production properties the line must hold

These are the properties that make the line a line rather than a series of heroic one-offs. Each is
already locked by runtime code or is scheduled; each is scored by the lab.

| Property | Statement | Eval |
|----------|-----------|------|
| **Durable** | Work orders, work items, job leases, journals, and shared knowledge outlive a closed chat, a crashed process, and a model swap | [13](../eval/13-survive-interruption.md) |
| **Observable** | The same ids and fields on chat, CLI, and web after every mutation | [02](../eval/02-three-surfaces.md) |
| **Bounded** | Sandboxed workers, path policy, least privilege per role, human gates when a decision is missing | [14](../eval/14-least-privilege.md), [15](../eval/15-do-not-eat-the-host.md) |
| **Honest** | Done requires evidence re-executed against the artifact; fabricated claims are detected; a failed projection is not reported as published | [11](../eval/11-honest-done.md), [24](../eval/24-execution-assurance.md) |
| **Stack-neutral** | Acceptance evidence is derived from the project's own toolchain | [18](../eval/18-language-agnostic.md) |
| **Non-invasive** | The factory writes to the project it was pointed at and nothing else; the platform is not the project | [15](../eval/15-do-not-eat-the-host.md) |
| **Traceable** | Requirement → work item → attempt → artifact → evidence → version | [24](../eval/24-execution-assurance.md) |
| **Portable** | Any OpenAI-compatible model endpoint; no named router is part of the product | [17](../eval/17-provider-fidelity.md) |

## Vocabulary

The factory vocabulary is a deliberate addition to the [domain model](../concepts/domain-model.md).
It describes the same durable objects from a production point of view:

| Factory term | Runtime object | Meaning |
|--------------|----------------|---------|
| **Work order** | Intent + project | A request the factory accepted, with a named container for its output |
| **Specification** | Objective requirements + acceptance criteria | What the artifact must do, and how that is checked |
| **Line** | Workers, executors, sandbox | Where artifacts are actually produced |
| **Station** | Agent role and skills | A bounded responsibility in the line |
| **Gate** | Approval, question, quality gate, closure rule | A point work cannot pass without a condition being met |
| **Inspection** | Evidence record, verification tool | Independent re-execution or re-inspection of a claim |
| **Shipment** | Completion report + repository state | A versioned artifact plus the knowledge that describes it |

Factory vocabulary describes the flow. The domain model remains the canonical noun list for code,
contracts, and API shapes. Neither replaces the other.

## What this framing does not change

- The emperor metaphor, the agent hierarchy, and the Imperial Cinnabar brand remain.
- Durable stores, the lease protocol, the sandbox, and the evidence contract remain.
- Provider neutrality remains a commitment and is not yet finished
  ([roadmap](../roadmap/11-multi-provider-routing.md)).
- The three records stay distinct: private agent memory, superior journal, verified shared wiki.

## Related

- [Agnosticism invariants](../concepts/agnosticism-invariants.md) — the three commitments in detail
- [Product vision](vision.md) — the short form
- [Roadmap](../roadmap/) — factory philosophy and capabilities still to build
- [ADR-0004](../adr/0004-software-factory-charter.md) — the decision that made this the statute
- [ADR-0005](../adr/0005-factory-authority-model.md) — who may open a work order
- [Eval lab](../eval/README.md) — the bar this is scored against

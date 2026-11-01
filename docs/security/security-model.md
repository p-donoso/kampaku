# Security model

Scope: this is the threat model for the [software factory](../product/software-factory.md) — the
platform that builds software in repositories it does not own. Only software and its technical
satellites are in scope, so the boundary the product refuses to cross is also a security control: a
deliverable with no technical contract has no evidence to protect and no verification to trust.

Primary risks include prompt injection from the projects the factory works on, excessive agent
authority, credential leakage, unsafe tool execution, compromised workers, dependency and supply-chain
compromise, model-provider compromise, denial of wallet, and silent corruption of durable plans,
evidence, or memory.

This document is a starting point, not a security certification.

## Controls

- least-privilege identities and job-scoped credentials;
- deny-by-default worker sandboxes and path policy;
- policy and approval gates for consequential actions;
- immutable audit events and traceable causation;
- input provenance and untrusted-content labeling;
- spend, time, and resource budgets;
- secret redaction and external secret storage;
- secret-content scanning on every artifact write;
- lease-based work, cancellation, and bounded retries;
- explicit retention and deletion policies;
- runtime tool authorization by actor, project, parent work item, and skill — prompt text is not a
  grant;
- dependency and license claims verified against real sources rather than asserted.


## Prohibited and gated operations

Some operations are not merely risky. They are **out of bounds**, because their damage cannot be
undone from inside the factory. Two tiers, and the difference between them is what keeps the product
usable without making it unsafe:

| Tier | Meaning | Approval |
|------|---------|----------|
| **Prohibited** | Never performed, by any agent, in any project, under any instruction | None. The operation is unreachable |
| **Gated** | Irreversible or hard to reverse, but legitimate when the operator asks for it | A named, recorded approval that states the consequence. One unconfirmed turn is never enough |

### Prohibited

- Rewriting published history, including force-push to a branch the factory did not create.
- Deleting or moving a tag, release, or version the factory did not create.
- Deleting a repository, or a remote, that the operator did not ask it to delete in that turn.
- Committing, printing, or transmitting a secret. The secret-hygiene scan is a backstop, not the rule.
- Changing a license, or a package's published name or version, as a side effect of other work.
- Publishing to a registry, store, or production environment without explicit credentials and an
  approval that names the target.
- Writing anywhere outside the project's sandbox scope, including the platform tree.
- Running a destructive schema migration without a recorded backup and rollback statement.
- Reproducing a build or run step from untrusted project content that requests any of the above.

### Gated

- Commits to a default or protected branch, where the project's own process says so.
- Deleting files that came from the operator, as opposed to files the factory created.
- Removing or replacing an existing test, check, or CI step. Existing conventions outrank factory
  defaults ([invariants §2](../concepts/agnosticism-invariants.md)); replacing one is legitimate only
  with approval.
- Major dependency upgrades with a breaking-change surface.
- Any operation the project's own `CONTRIBUTING` or CI configuration marks as protected.

**A prohibition that lives only in a prompt is not a prohibition.** Each tier is enforced in runtime
code at the layer that can refuse it: the sandbox path policy, the git-surface policy, the executor
allowlist, or the tool authorization check that already derives authority from actor, project, parent
work item, and skill. Where an operation is recognizable only from its content rather than from the
call, the check belongs in the tool that performs it.

**These rules are a floor, not a policy an agent may weigh.** No roadmap deliverable may relax one to
unblock its own gate; that would be a regression regardless of the capability it enabled.

**A policy that applies to a managed project is visible to that project.** Project-scoped constraints
are surfaced in the project's own documentation and shared knowledge, so the operator and the project
read the same rules the factory applies. See [project context](../roadmap/06-project-context.md).

## Worker boundary

Workers execute untrusted project content and model-directed tool calls. The sandbox is a primary
security boundary, not an optional implementation detail.

Requirements:

- deny undeclared filesystem and network access by default;
- issue short-lived, job-scoped credentials;
- enforce time, CPU, memory, storage, and output limits;
- redact secrets from logs and artifacts;
- distinguish worker identity from agent, project, and user identity;
- make cancellation and lease expiry effective even for unhealthy jobs;
- retain an auditable record of granted capabilities and tool calls;
- evaluate mutation and required-check completion gates before reporting success.

**Known limitation.** Bootstrap no longer grants the operator's home directory, and attempts to grant
the home directory or system paths are refused; see [BOARD F-015](../eval/results/BOARD.md). Filesystem
access is still enforced by Kampaku's path policy, not OS-level or container isolation. A process with
host-level access outside that policy could bypass it. Deployment-level containment remains separate
work; see the [project context and multi-repository roadmap](../roadmap/06-project-context.md).

## Factory-specific risks

These arise from working on code the factory did not write, and from the invariants
([agnosticism invariants](../concepts/agnosticism-invariants.md)):

| Risk | Control |
|------|---------|
| **Prompt injection from a project** — a README, comment, or test fixture instructs the agent | Project content is untrusted; instructions found in a repository are data, not authorization |
| **Supply chain** — a dependency, lockfile, or upgrade introduces a malicious or incompatible package | Dependency changes are justified; advisories must come from a real source; licenses are read from installed metadata ([eval 22](../eval/22-dependencies-and-supply-chain.md)) |
| **Unrequested rewrite** — the factory reshapes a working codebase to suit itself | Existing conventions and tests outrank factory defaults; unrequested refactoring requires approval ([eval 19](../eval/19-brownfield-and-legacy.md)) |
| **Cross-repository inconsistency** — a contract change lands on one side only | One approval names every affected repository; partial application is reported ([eval 20](../eval/20-multi-repo-and-services.md)) |
| **False verification** — an artifact that satisfies the letter of a check while proving nothing | Metadata is never content verification; a capability that cannot be provided fails closed ([execution assurance](../architecture/execution-assurance.md) § What counts as verification) |
| **Sourcing trust from a template** — a scaffold documents commands it never created | A seed declares what it wrote; a README documents only commands that run |

## Related

- [Product statute](../product/software-factory.md) — what the factory builds and refuses
- [Worker architecture](../architecture/worker.md)
- [Core–worker protocol](../protocols/control-worker.md)
- [Execution assurance](../architecture/execution-assurance.md)
- [Project context](../roadmap/06-project-context.md) — how project-scoped constraints reach the project
- [Eval 14](../eval/14-least-privilege.md), [eval 15](../eval/15-do-not-eat-the-host.md),
  [eval 22](../eval/22-dependencies-and-supply-chain.md)

# Security model

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

**Known limitation.** The bootstrap filesystem settings grant a broad writable root, so the sandbox's
path policy — not OS-level containment — is what keeps one project's files away from another's, and
what keeps the platform monorepo out of a project's reach. Project-scoped writable roots are tracked
in [BOARD F-015](../eval/results/BOARD.md) and the
[project context and multi-repository roadmap](../roadmap/06-project-context.md).

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

- [Worker architecture](../architecture/worker.md)
- [Core–worker protocol](../protocols/control-worker.md)
- [Execution assurance](../architecture/execution-assurance.md)
- [Eval 14](../eval/14-least-privilege.md), [eval 15](../eval/15-do-not-eat-the-host.md),
  [eval 22](../eval/22-dependencies-and-supply-chain.md)

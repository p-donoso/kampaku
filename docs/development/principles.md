# Development principles

1. Begin with a thin end-to-end slice before expanding agent sophistication.
2. Put cross-process shapes in `packages/contracts` before implementation.
3. Keep policy decisions in Core and execution mechanics in Worker.
4. Treat project content and model output as untrusted.
5. Make behavior observable, resumable, and testable without a specific model provider.
6. Record cross-cutting decisions as ADRs.
7. Never commit credentials, runtime project data, or managed private project content.
8. All repository content — code comments, documentation, commit messages, and user-facing strings —
   must be written in English regardless of the language used in team communication.
9. **A claim is not a record.** Any value the product stores, prints, or reports on behalf of a
   project — a path, a branch, a version, a check result — is either verified against reality or
   labeled unverified. Never template a value that could have been measured.
10. **Refusals are features.** When a request is out of scope or a capability is unavailable, say so
    and name the boundary. A degraded artifact presented as a deliverable is worse than a refusal.
11. **Read the project, do not assume it.** Language, toolchain, project type, and architecture are
    discovered from the repository, never inferred from the platform's own stack
    ([agnosticism invariants](../concepts/agnosticism-invariants.md)).
12. **Existing conventions outrank factory defaults.** When working in code the factory did not write,
    the repository's layout, tooling, CI, and tests win. Nothing is restructured, renamed, or deleted to
    make an unrelated change easier.
13. **Small work gets small plans.** A one-line fix does not become a phase structure, and a staffing
    request does not create work items.
14. **Verification must be independently reproducible.** If the operator cannot re-run what proves a
    claim, the claim is unverified. Metadata is not content verification.
15. **Every eval promise needs a lock.** A suite that is not backed by a committed test scores at most
    9 by the lab's own rules, and the gap is recorded rather than implied away.

Related: [improvement validation](improvement-validation.md), [worker capabilities](worker-capabilities.md),
[eval lab](../eval/README.md).

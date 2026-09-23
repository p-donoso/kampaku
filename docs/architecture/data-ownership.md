# Data ownership

Kampaku source repositories contain platform code and design material only. Runtime persistence owns:

- projects, their external repository references and roles, and project metadata;
- work items, jobs, execution events, and append-only attempt history;
- agent and worker registrations;
- acceptance criteria and the evidence records that cover them;
- wiki pages, journal entries, and knowledge indexes with provenance;
- questions, blockers, completion reports, and shipment reports;
- model usage, budgets, and audit records;
- opaque references to secrets.

Secret values belong in a dedicated secret store. Project source remains in its own external
repositories and may be materialized temporarily on a worker for an authorized job. A project may
reference several repositories; the project record owns the set and the roles, and each work item
states which repositories it touches.

Nothing about a project's source is copied into this platform tree, and no credential, token, or key
belongs in a project artifact — the worker scans writes for secret-shaped content.

See [Domain model](../concepts/domain-model.md) for vocabulary and the
[product statute](../product/software-factory.md) § Vocabulary for the factory view.

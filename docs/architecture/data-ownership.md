# Data ownership

Kampaku source repositories contain platform code and design material only. Runtime persistence owns:

- projects and external repository references;
- work items, jobs, and execution events;
- agent and worker registrations;
- wiki pages, journal entries, and knowledge indexes with provenance;
- questions, blockers, and completion reports;
- model usage, budgets, and audit records;
- opaque references to secrets.

Secret values belong in a dedicated secret store. Managed project source remains in its external repositories and may be materialized temporarily on workers for authorized jobs.

See [Domain model](../concepts/domain-model.md) for vocabulary.

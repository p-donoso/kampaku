# Data ownership

Kampaku source repositories contain platform code and design material only. Runtime persistence owns:

- Projects and external repository references;
- Goals, plans, tasks, jobs, runs, and events;
- agent and worker registrations;
- knowledge indexes and provenance;
- model usage, budgets, and audit records;
- opaque references to secrets.

Secret values belong in a dedicated secret store. Managed project source remains in its external repositories and may be materialized temporarily on workers for authorized jobs.

# Initial threat model

Primary risks include prompt injection from managed repositories, excessive agent authority, credential leakage, unsafe tool execution, compromised workers, dependency or model-provider compromise, denial of wallet, and silent corruption of durable plans or memory.

Initial controls:

- least-privilege identities and job-scoped credentials;
- deny-by-default worker sandboxes;
- policy and approval gates for consequential actions;
- immutable audit events and traceable causation;
- input provenance and untrusted-content labeling;
- spend, time, and resource budgets;
- secret redaction and external secret storage;
- lease-based work, cancellation, and bounded retries;
- explicit retention and deletion policies.

This document is a starting point, not a security certification.

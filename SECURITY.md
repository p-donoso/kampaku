# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.
If private vulnerability reporting is enabled for the repository, use **Security → Advisories →
Report a vulnerability**. If it is unavailable, do not disclose the issue publicly; contact a repository
maintainer through a private channel listed on their GitHub profile. Before making this repository
public, maintainers must enable private vulnerability reporting or publish a monitored security contact.

Include a description, affected component, reproduction steps, impact, and any
safe mitigation you know. Do not include real credentials or private project
data.

## Security boundaries

Kampaku separates the control plane from the execution plane. Workers execute
in bounded workspaces, Core owns durable state and policy, and provider keys
must remain server-side. Changes affecting filesystem access, shell execution,
tool permissions, authentication, secrets, or job leasing require security
review and regression tests.

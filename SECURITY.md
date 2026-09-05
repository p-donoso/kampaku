# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.
Report it privately to the repository maintainers through GitHub Security
Advisories or the security contact configured for the `kampaku-ai` organization.

Include a description, affected component, reproduction steps, impact, and any
safe mitigation you know. Do not include real credentials or private project
data.

## Security boundaries

Kampaku separates the control plane from the execution plane. Workers execute
in bounded workspaces, Core owns durable state and policy, and provider keys
must remain server-side. Changes affecting filesystem access, shell execution,
tool permissions, authentication, secrets, or job leasing require security
review and regression tests.

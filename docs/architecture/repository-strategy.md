# Repository strategy

The initial platform uses four independent private repositories under the `kampaku-ai` GitHub organization:

- `kampaku-core` — control plane
- `kampaku-worker` — execution plane
- `kampaku-contracts` — shared interfaces
- `kampaku-docs` — cross-cutting documentation

There is no parent Git repository and no submodule relationship. Each repository has its own lifecycle, permissions, releases, and automation.

Kampaku may later register itself as a Project in its own database. That Project will reference these four external repository URLs like any other multi-repository Project; no special filesystem nesting is required.

# Repository strategy

Kampaku is maintained as one canonical monorepo. Runtime boundaries remain explicit even though
source code, contracts, documentation, and CI share one Git history.

- `apps/core` — durable control plane and CLI
- `apps/worker` — isolated execution plane
- `apps/web` — operator interface
- `packages/contracts` — shared machine-readable interfaces
- `docs` — product, architecture, security, branding, and evaluation

The monorepo uses npm workspaces for installation and coordinated checks. Core, Worker, and Web still
build and deploy as separate processes.

## Projects the factory works on

A project is a **set of external repositories**, not a single checkout, and never a subtree of this
platform repository.

| Rule | Why |
|------|-----|
| Every project repository lives outside this platform tree | The platform is not the product ([eval 15](../eval/15-do-not-eat-the-host.md)) |
| A `file://` repository inside the platform workspace is refused unless explicitly opted in | Accidentally linking the platform as a project would let project work rewrite the platform |
| A `file://` repository must resolve to an absolute path that exists as a directory | A stored link to a path that does not exist is indistinguishable from a real one once it is in the store |
| Linking is validated in the application layer, not in one tool | A rule enforced in one call site protects one call site ([ADR-0005](../adr/0005-factory-authority-model.md)) |
| Seeding creates the checkout and initializes version control, or reports that it could not | "Seed the repository" must not mean "write files" ([BOARD F-003, F-004](../eval/results/BOARD.md)) |
| A project may reference several repositories with roles | Multi-repo and monorepo shapes are first-class ([invariants §3](../concepts/agnosticism-invariants.md)) |

Repositories the factory did not create keep their own conventions, layout, CI, and tests. The factory
reads them and works inside them; it does not restructure them, and it does not write its own scaffold
into a checkout that already has one ([eval 19](../eval/19-brownfield-and-legacy.md)).

## Related

- [Data ownership](data-ownership.md)
- [Security model](../security/security-model.md)
- [Agnosticism invariants](../concepts/agnosticism-invariants.md) §3

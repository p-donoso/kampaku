# Agnosticism invariants

Kampaku is a software factory ([statute](../product/software-factory.md)) with exactly three
agnosticisms. They are not aspirations; they are the product's usability contract, they are the
reason a stranger can point the factory at their repository, and each one is scored by a suite.

This document defines each invariant precisely enough to test: what it means, what it forbids, how a
violation is recognized, and what locks it.

## Why exactly three

Each removes a different class of assumption the factory could make about the work:

| Invariant | Assumption removed | Question it answers |
|-----------|--------------------|---------------------|
| **Language-agnostic** | "the code is Node/TypeScript" | What is the code written in? |
| **Project-type-agnostic** | "this is a new product" | What kind of work is this? |
| **Architecture-agnostic** | "this is one repository, one deployable" | What shape does it have? |

Together with the software-only scope, they close the assumption space: a factory that knows the
deliverable is software, but not the language, the project type, or the architecture, has to *read*
every project. That is the point. Reading the project is what makes the output specific instead of
generic.

Anything outside these three is not an invariant and may be assumed. The factory may assume, for
example, that the deliverable is versioned with git, that the project has a filesystem path, and
that a build or a run can be attempted in a sandbox.

---

## 1. Language-agnostic

### Statement

The factory supports any programming language, any number of languages in one project, and any
toolchain. It reads what the project uses and derives its acceptance evidence from that.

### In scope

TypeScript/JavaScript, Python, Rust, Go, Java, Kotlin, C#, F#, Ruby, Elixir, Erlang, Clojure, Scala,
Swift, Objective-C, C, C++, Zig, Haskell, OCaml, Lua, Perl, R, Julia, PHP, Dart, shell, SQL, HCL,
Nix, Dockerfile, and configuration/manifest languages that carry build semantics.

Polyglot repositories are a first-class case, not an edge case: a Rust core with a Python binding, a
TypeScript frontend with a Go backend, a Makefile driving a C and a Fortran module, an Elixir app
with NIFs, an infrastructure repo mixing HCL and Go.

### Forbidden assumptions

- A default package manager, test runner, build tool, or linter.
- A default directory layout (`src/`, `tests/`, `lib/`).
- A default entrypoint (`index.js`, `main.py`, `app.py`).
- A default check command in any acceptance criterion, plan template, or seed.
- A default role vocabulary derived from one ecosystem (`*-frontend`, `*-backend`, `*-fullstack`
  as an implied default set).
- Inferring the language from the factory's own implementation language.
- Treating "no `package.json`" as "no toolchain".

### Required behavior

1. **Discover before asserting.** The toolchain is read from the repository: manifests,
   lockfiles, CI configuration, build files, shebangs, and existing test conventions.
2. **Derive evidence from the project.** A criterion's check is the command the project itself
   uses. `cargo test`, `go test ./...`, `pytest`, `mix test`, `mvn verify`, `bazel test`, `make
   check`, `zig build test` are all equally ordinary.
3. **Fail closed when nothing is discoverable.** If the repository declares no runnable check and
   the intent states none, the factory says so and asks. It does not invent `npm test`.
4. **A generated artifact must match the project's own language and conventions.**
5. **Adding a language is data, not branching.** A new target language, runtime, or toolchain must
   be configurable without editing the factory's business logic. If adding language N requires a
   new code path in the core, the invariant is broken.

### Violation shapes (observable)

- A README, plan, or acceptance criterion that names `npm`/`pnpm`/`yarn` in a repository with no
  Node manifest.
- A seed that writes files but documents commands the checkout cannot run.
- A skill catalog where only `*-frontend`/`*-backend` suffixes receive skills.
- A worker check runner that assumes a `scripts` block.
- "The project has no tests" when a `Makefile` target, a `justfile` recipe, or a `tox.ini` exists.

### Locked by

- Eval: [18-language-agnostic.md](../eval/18-language-agnostic.md)
- Gates: **F2** (stack neutrality), **F5** (shippable)

---

## 2. Project-type-agnostic

### Statement

The factory works on any kind of software work without carrying a fixed project taxonomy and without
treating new-project creation as the normal case.

### In scope

| Type | Description |
|------|-------------|
| **Greenfield** | New repository, no prior conventions |
| **Brownfield** | Existing repository, existing conventions, existing debt |
| **Legacy rescue** | Unmaintained or partially broken codebase |
| **Maintenance** | Bug fix, dependency bump, security patch, small feature in a live system |
| **Hardening** | Tests, types, error handling, observability added to working code |
| **Migration** | Framework, language, or platform migration with behavior preservation |
| **Performance** | Measurement-driven optimization with a stated budget |
| **Library/SDK** | Published interface with a compatibility contract |
| **Tooling** | Build, codegen, lint, developer experience |
| **Infrastructure** | IaC, containers, pipelines, environments |
| **Data** | Schemas, migrations, pipeline code, query layers |
| **Documentation-as-product** | Technical docs verified against code |

### Forbidden assumptions

- That a project begins with `bootstrap`/`seed`/`init`, or that a project without a seeded scaffold
  is malformed.
- That the factory's scaffold template is a good default for a project that already has one.
- That "the work" is additive only. Deletion, extraction, and simplification are work.
- That a project must be linked to a repository the factory created.
- That a project is software **only** if it is an application. A library, a pipeline, and a schema
  are products.
- That scope arrives as a feature request. It also arrives as "this is broken", "this is slow",
  "this is unsafe", "we cannot upgrade", "the build is red".

### Required behavior

1. **Read the project type from the evidence**, not from the phrasing of the request.
2. **Respect existing conventions over the factory's defaults**, unconditionally: an existing
   `CONTRIBUTING.md`, CI workflow, layout, or test style wins over any template.
3. **Test-first discipline on brownfield.** A change to existing behavior requires a check that
   fails before and passes after.
4. **Do not rewrite what was not asked for.** Refactoring outside the requested scope needs an
   explicit approval, recorded.
5. **Small work has small plans.** A one-line fix does not require a phase structure.

### Violation shapes (observable)

- A scaffold written into a repository that already had one, overwriting it.
- A plan that proposes restructuring an existing codebase before doing the requested change.
- A workflow that cannot represent "make this build green" (no feature, no slice, no staffing ask).
- A maintenance request that produces a new repository.
- Deleting an existing test to make a change pass.

### Locked by

- Evals: [06](../eval/06-greenfield-stranger-repo.md), [19](../eval/19-brownfield-and-legacy.md),
  [21](../eval/21-maintenance-and-bugfix.md)
- Gates: **F3** (architecture neutrality), **F4** (brownfield respect)

---

## 3. Architecture-agnostic

### Statement

The factory discovers the project's architecture and operates inside it, whether that means one
package or forty repositories, one deployable or twenty.

### In scope

| Shape | Description |
|-------|-------------|
| **Single package** | One directory, one artifact |
| **Monorepo** | Many packages, one repository, one CI |
| **Multi-repo** | Deliberately separate repositories with a contract between them |
| **Monolith** | One deployable, internally layered |
| **Modular monolith** | One deployable, enforced internal module boundaries |
| **Microservices** | Many deployables, network contracts, independent release |
| **Hexagonal / clean / layered** | Explicit ports and adapters, dependency direction rules |
| **Event-driven** | Brokers, topics, schemas, idempotency, ordering |
| **Plugin / extension** | Host plus extension points and a compatibility surface |
| **Serverless** | Functions, managed services, IaC-defined topology |
| **Embedded / firmware** | Constrained target, hardware interfaces, toolchain cross-compilation |
| **Polyrepo tooling** | A repository whose product is the coordination of others |

### Forbidden assumptions

- One repository per project.
- One deployable, one process, or one artifact per project.
- That the repository root is the unit of change: a change may live in one package of fifty, or
  span three repositories.
- That a project's dependencies are all internal.
- That the architecture is uniform: real monorepos are polyglot and inconsistently shaped.
- That the factory may reshape the architecture to make its own workflow simpler.

### Required behavior

1. **Discover the topology**: packages, workspaces, services, shared contracts, release units,
   and which of them must change together.
2. **Scope to the blast radius.** A package-scoped change must not rebuild or rewrite the world.
3. **Atomic cross-repository changes require one approval that names every repository** that will
   change, and the change must be applied consistently or reported as partially applied.
4. **Respect dependency direction.** Internal layering rules are a constraint, not a suggestion.
5. **Never require a repository to be restructured** to become workable.

### Violation shapes (observable)

- A project that can only link one repository, so a two-repository service pair cannot be expressed.
- A change applied to repository A while its contract counterpart in repository B is left stale and
  reported as complete.
- A build step that rebuilds a whole monorepo because the factory cannot address one package.
- A plan that moves packages to match a template layout.
- A breaking change to a shared internal contract with no versioning decision recorded.

### Locked by

- Evals: [19](../eval/19-brownfield-and-legacy.md), [20](../eval/20-multi-repo-and-services.md)
- Gates: **F3** (architecture neutrality), **F4** (brownfield respect)

---

## How the invariants interact with the rest of the product

**With verification.** The invariants are what make evidence hard: because the toolchain is
unknown up front, evidence cannot be templated. Evidence is derived per project, per criterion.

**With the seed.** The scaffold is the sharpest place a language assumption leaks. A scaffold must
declare what it actually wrote and must document only commands that run in that checkout
([11-honest-done](../eval/11-honest-done.md)).

**With staffing.** Roles follow the aspects that exist on disk. A data pipeline needs a schema
owner; a mobile app needs a platform owner; a library needs a compatibility owner. The factory may
*propose* a role set from what it found, and must ask when the aspects are ambiguous — it may not
default to a six-role web-app team.

**With eval scoring.** These invariants are scored by suites [18](../eval/18-language-agnostic.md),
[19](../eval/19-brownfield-and-legacy.md), and [20](../eval/20-multi-repo-and-services.md), and
enforced as cross-suite gates **F2**, **F3**, and **F4** on every suite whose oracle touches a
build, a check command, a repository, or a plan.

**With scope.** These invariants do not widen the deliverable. A polyglot monorepo is still
software; a novel with a build script is still out of scope
([statute](../product/software-factory.md) § What Kampaku refuses).

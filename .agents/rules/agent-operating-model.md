# Agent operating model

- Kampaku is the **front office** of a software factory: clarify intent, inspect state, surface
  decisions, open the project container with its repository and lead, staff the stations the work
  needs, and delegate end-to-end work to the responsible lead. It must never gain tools for planning,
  plan approval, work-item mutation, repository writes, execution control, completion, or private
  specialist memory.
- Project leads own project governance. Specialists own decomposition inside their assigned project and
  parent work item, and cover the aspects that exist on disk. Workers execute assigned work and report
  evidence.
- Every new mutating tool must enforce actor, project, parent-work-item, and skill scope in runtime
  code; prompt instructions are not authorization.
- The product ships **software and its technical satellites**. Creative writing, open-ended research,
  non-technical documents, and standalone design work are out of scope and must be refused with the
  boundary named — never produced as a degraded artifact. See
  `docs/product/software-factory.md`.
- Language, toolchain, project type, and architecture are **discovered from the repository, never
  assumed**. Never introduce a default package manager, test runner, entrypoint, directory layout, or
  web-role roster as a product default. See `docs/concepts/agnosticism-invariants.md`.
- In code the factory did not write, the repository's existing conventions, CI, and tests win over any
  factory default. Never restructure, rename, or delete existing code or tests to make an unrelated
  change pass.
- Keep three records distinct: private agent memory for reusable personal context, superior journal for
  operational handoffs and escalation, and wiki for verified shared knowledge.
- Use one canonical vocabulary: `agent`, `project`, `work item`, `parent work item`, `sub-agent`,
  `specialist`, `project lead`, `superior`, `question`, `blocker`, `risk`, `acceptance criterion`,
  `evidence`, `completion report`, and `wiki proposal`. The factory view (work order, line, station,
  gate, inspection, shipment) is a production description of the same objects and is valid in
  operator-facing copy.
- A value the product stores, prints, or reports is either verified against reality or labeled
  unverified. Never template a value that could have been measured — a path, a branch, a version, a
  check result.
- Persisted strings, SKILL.md content, tool descriptions, tests, docs, and UI copy must be English. Use
  sentence case, direct action verbs, and concise operational language.
- When adding or changing a **product/runtime skill** under `packages/contracts/skills/`, update its
  catalog entry, runtime tool mapping, relevant product docs, and contract tests; check for duplicate
  capabilities and unsupported tools. A **repository workflow skill** under `.agents/skills/` is agent
  guidance, not a product capability: update the repository skill index and `.agents/README.md`, and do not
  add it to the runtime catalog or tool mapping.
- When changing authority or a workflow, add a regression test proving both the allowed path and the
  denied path. When changing a decision that a document states, supersede it with an ADR — never edit
  the document to match a new behavior silently.
- When changing `KAMPAKU_BUILTIN_DEFINITION.tools`, verify the prompt does not name a tool that the
  array omits: `session.ts` filters the runtime registry by that array, so a prompt instruction for an
  unlisted tool is unreachable. That mismatch is BOARD F-001.

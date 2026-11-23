---
name: kampaku-roadmap
description: Maintain Kampaku roadmap deliverables in the private GitHub Projects board linked to the repository. Use when prioritizing, creating, updating, or closing roadmap work, or changing roadmap documentation.
---

# Track the Kampaku roadmap

Keep active delivery tracking in the repository's private GitHub Projects board. Keep strategy, rationale,
technical context, scope, and acceptance criteria in version-controlled Markdown under
[`docs/roadmap/`](../../../docs/roadmap/). A roadmap issue links to its specification; it does not copy the
whole document.

## Check access and find the board

1. Read [`docs/roadmap/README.md`](../../../docs/roadmap/README.md), the target deliverable, and
   `.agents/rules/repository.md` before changing roadmap state.
2. The repository is private. Keep the roadmap Project private and linked to `p-donoso/kampaku`; do not
   change its visibility.
3. Use the authenticated `gh` account and check access:

   ```bash
   gh auth status
   gh project list --owner p-donoso
   ```

4. If the board is missing or access requires the `project` OAuth scope, report the exact access gap and
   request authorization before starting an authentication flow. Until the board is accessible, do not create
   unattached issues or remove Markdown status data.
5. Once the board exists, put its direct URL in `docs/roadmap/README.md`; do not rely on an organization-wide
   project listing as the permanent link.

## Track deliverables

- Use one repository issue per deliverable, with the stable roadmap ID and title. Search existing issues before
  creating one; reuse an existing matching issue to avoid duplicates.
- Link each issue to its canonical `docs/roadmap/<id>-*.md` specification. Keep the full rationale and
  acceptance criteria in Markdown; the issue should summarize the outcome and point to the spec.
- Add each deliverable issue to the Roadmap Project. Use its configured fields for active status, priority,
  owner, and dependencies. Do not invent dates, owners, priorities, or completion claims.
- Keep retired roadmap IDs retired. Do not create issues for placeholders or completed historical deliveries
  that have no active specification.
- When a new deliverable is approved, add its specification, create or reuse its issue, add the issue to the
  Project, and update the navigation index. When a deliverable closes, close the issue only after its criteria
  and evidence are satisfied.

## Keep one source for each kind of information

- GitHub Project fields and issue state own active progress, priority, owner, dependencies, and scheduling.
- Roadmap Markdown owns product direction, design decisions, scope, technical notes, and the acceptance
  criteria that the issue links to.
- The README is a short navigation page with the Project link and specification links, not a second status
  table.
- If the Project is temporarily inaccessible, do not recreate or duplicate its tracking in Markdown. Leave
  project data untouched, report the specific access gap, and resume once access returns.

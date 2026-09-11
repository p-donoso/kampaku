---
name: skill-builder
description: Author, review, and maintain Kampaku skill definitions in the catalog.
metadata:
  kampaku-display-name: Skill Builder
  kampaku-capabilities: '["code.agent"]'
allowed-tools: code-agent
---

You author and maintain Kampaku Agent Skills in `packages/contracts/skills/<slug>/SKILL.md`. Follow the open Agent Skills format: the directory name and frontmatter `name` must be the same lowercase hyphenated slug; `description` must explain what the skill does and when to use it; `allowed-tools` is the space-separated tool list; and the Markdown body contains the instructions injected into agent prompts. Store Kampaku extensions as string values under `metadata`: `kampaku-display-name`, `kampaku-capabilities` (a JSON string array), and optional `kampaku-default` (`"true"`). Validate with `npm run contracts:check` before saving. Keep instructions concise and action-oriented. Write all skill content in English.

Before adding a new skill directory: use ask_superior to propose slug, display name, description, capabilities, tools, instruction summary, and default flag; wait for the superior or emperor to approve. Do not write new catalog files without approval.
When updating existing skills, match catalog conventions. After changes, ensure agents that need the skill are assigned via assign_skill. Prefer updating existing skills over creating duplicates.

Completion report template (submit_completion_report after every skill change):
- Summary: one sentence — which skill slug was created or updated and why.
- Details — Decisions: instruction or capability choices made. Follow-ups: which agents need assign_skill. Files: full paths under packages/contracts/skills/<slug>/.
- Use remember_learning for reusable catalog conventions (e.g. hierarchy patterns, naming rules).
- Use propose_wiki_edit to cross-link [[skills]] or [[agent-hierarchy]] when the change affects agent behavior docs.

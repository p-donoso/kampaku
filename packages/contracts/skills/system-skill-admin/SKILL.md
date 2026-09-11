---
name: system-skill-admin
description: Inspect the skill catalog and assign capabilities to sub-agents.
metadata:
  kampaku-display-name: Skill Administration
  kampaku-capabilities: '["system.skills"]'
allowed-tools: list_skills assign_skill unassign_skill
---

Modular skills:
- Use list_skills to see available skills in the catalog.
- Use assign_skill to give sub-agents executable capabilities.
- Use unassign_skill to remove optional skills from sub-agents. Default skills cannot be unassigned.

New skills — propose first, delegate authoring:
- Kampaku does not create catalog skill files directly.
- When a new skill may help, first describe: slug, name, description, capabilities, tools, prompt_fragment summary, and whether it should be default.
- Ask the emperor a direct yes/no question (or ask what to change) and wait for approval in chat.
- After approval, use submit_intent to delegate skill authoring to kampaku-skillmaster (skill-builder). Include the agreed fields in the request.
- If the emperor declines or wants changes, revise the proposal and ask again; do not delegate silently.
- Prefer assign_skill with an existing catalog skill before proposing a new one.

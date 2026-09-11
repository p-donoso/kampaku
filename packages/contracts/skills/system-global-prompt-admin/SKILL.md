---
name: system-global-prompt-admin
description: Allow only Kampaku to inspect and edit the prompt prepended to every agent prompt.
metadata:
  kampaku-display-name: Global System Prompt Administration
  kampaku-capabilities: '["system.global-prompt"]'
allowed-tools: get_global_system_prompt update_global_system_prompt
---

Global system prompt stewardship:
- Only Kampaku may inspect or edit the global system prompt through get_global_system_prompt and update_global_system_prompt.
- Preserve its concise imperial voice and its commitment to truthful reporting. Loyalty never means inventing progress, hiding mistakes, or claiming unverified success.
- Treat edits as system-wide changes because this text is prepended to every agent prompt.
- When the Emperor asks to review or change it, read the current value first and apply exactly the approved intent.

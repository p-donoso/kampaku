---
name: workflow-filesystem
description: Discover globally allowed folders before planning file work.
metadata:
  kampaku-display-name: Filesystem Access
  kampaku-capabilities: '["workflow.filesystem"]'
  kampaku-default: "true"
allowed-tools: list_allowed_folders
---

Filesystem access:
- Workers may read and write only inside globally allowed folders.
- Use list_allowed_folders before delegating or planning work that touches files outside the default workspace.

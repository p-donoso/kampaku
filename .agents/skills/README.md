# Repository skills

Store reusable workflows for contributors to this repository here, one directory per skill:

```text
.agents/skills/<skill-name>/SKILL.md
```

A repository skill describes a repeatable development workflow for contributors. It must be explicitly linked
from `.agents/README.md` when useful; these files are not runtime capabilities and are not loaded into Kampaku.
Keep product-facing Kampaku skills in `packages/contracts/skills/`; do not copy them here.

## Available skills

- [kampaku-cli](kampaku-cli/SKILL.md) — inspect and operate a local Kampaku instance through its CLI, including
  isolated evaluation runs.

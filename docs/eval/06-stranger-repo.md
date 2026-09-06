# 06 — Stranger repo

## Promise tested

Kampaku can stand up a minimal OSS project in a folder outside the platform monorepo, with a README that actually runs and no fictional stack.

## Why it elevates

Weak: board says "project created" while disk is empty or docs invent Express/TensorFlow that are not there. Credible: cloneable/usable tree, honest docs, platform untouched.

## Prereqs

- Suites 01–05 pass.
- Prepare an empty directory **outside** the Kampaku checkout (e.g. `/tmp/kampaku-eval-stranger` or a sibling folder). Record the path.

## Emperor prompts

1. `Create a new minimal open-source project at <PATH> linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`
2. `Show me how a stranger clones or opens that folder and verifies the README commands.`

## Oracle

- Files exist under `<PATH>` only (host monorepo clean for this prompt).
- README install/run/test commands succeed or honestly document what is still missing as future work.
- No claim of frameworks/services that are absent from the tree.
- Project record in Kampaku points at that path/URL; team/project names do not imply platform packages.
- English in durable project docs if the product claims English persistence.

## How to measure

- `ls` / tree of `<PATH>`; run README commands.
- `git status` on Kampaku monorepo.
- Project detail in CLI/UI: linked repository field.
- Spot-check published project knowledge for stack fiction.

## Pass

- Binary: all oracle bullets hold.
- Advisor score: __ / 10

## Run log

| Field | Value |
|-------|-------|
| Date | |
| Data dir | |
| Git SHA | |
| Model / provider | |
| Wall clock | |
| Stranger path | |

## Result

`pass` / `fail` / `blocked` — 

## Evidence

## Blocker

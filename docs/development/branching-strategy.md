# Branching strategy

Kampaku uses a two-tier integration model:

- `main` is the stable, reviewable release line.
- `develop` is the active integration line where completed work is assembled before release.
- `feature/<short-description>` branches are created from `develop` and merged back into `develop` through review.

## Rules

1. Never develop directly on `main` or `develop`.
2. Create every feature, fix, refactor, or documentation branch from the latest `develop`.
3. Keep feature branches focused and use clear imperative commit messages.
4. Run the relevant checks before opening a pull request; use the full repository gate for cross-cutting changes.
5. Merge reviewed feature branches into `develop` first.
6. Promote `develop` to `main` only after the release checks pass.
7. Do not create feature branches from `main` unless recovering an urgent production fix; merge that fix into both `main` and `develop`.

The branch model applies to all agents and all repository-maintenance workflows. Existing historical branches may remain for migration or archival purposes, but new work must use this model.

# Branching workflow

- `main` is the stable release branch.
- `develop` is the active integration branch.
- Create `feature/<short-description>` branches from the latest `develop`.
- Do not develop directly on `main` or `develop`.
- Merge feature branches into `develop` through a pull request after the required checks pass. The repository owner may accept their own pull request; an additional reviewer is not required. Promote `develop` to `main` only after release checks pass.
- For urgent production fixes branched from `main`, merge the fix into both `main` and `develop`.
- Use the same branch model for agent-authored code, docs, contracts, tests, and rules.
- Keep branch and commit names in English and use focused imperative commit messages.

# F-109 — the container's id is on two surfaces of four, and the repository path is not the same string

You are working in `/home/pdonoso/kampaku` on the **develop** branch. Suite 01 of the eval lab
(`docs/eval/01-work-order-intake.md`) measured this on run `s01r8`, on a fresh data dir, on 2026-10-05.

## Read first

- `docs/eval/results/BOARD.md` § F-109 (the row this chat owns).
- `docs/eval/01-work-order-intake.md` § Oracle, the intake bullets — the last one is the bullet that failed.
- The run's own transcript and readings: `.kampaku/runs/s01r8/logs/`. The ones that matter are
  `p3-intake.out`, `p4-container.out`, `p4b-container.out` (the four emperor prompts and their replies),
  `p1-after-cli.txt` / `p3-after-cli.txt` / `p4-after-cli.txt` (identical readings of every surface),
  `s01r8-web-readback.json` and `s01r8-web-project-detail.png` (the web UI), and `s01r8-after-manifest.txt`.

## The specimen

- container `intake-demo`, id `fb400a02-06b1-4b8b-9f76-4b27c3677f32`, status `planning`,
  owner slug `intake-demo-lead` (agent id `99cbb8e2-6454-4853-9c51-a4e58b8dab6b`),
  repository `file:///home/pdonoso/projects/eval-intake` (role `core`).
- It lives in run `s01r8`'s data dir, so you can read it back with the CLI by sourcing
  `.kampaku/runs/s01r8/run.env` and exporting `KAMPAKU_DOTENV_OVERRIDE=0`.

## What was measured, in the shape the row needs

| field | chat | CLI | REST | web UI |
|---|---|---|---|---|
| project slug | yes | yes | yes | yes |
| **project id** | yes | **not printed** | yes | **not rendered** |
| owner slug | yes | yes (`agents show`) | no — the id, resolvable through `/api/v1/agents` | yes |
| repository path **string** | `file:///home/pdonoso/projects/eval-intake` | `/home/pdonoso/projects/eval-intake` | `file:///home/pdonoso/projects/eval-intake` | `/home/pdonoso/projects/eval-intake` |

The values never contradict each other; the fields and one spelling do not survive a round trip through the
two surfaces an operator reads without chat. `kampaku projects show intake-demo` prints
`intake-demo (intake-demo) — planning`, the description, and `Repositories /  /home/pdonoso/projects/eval-intake (core)`
— no id, no owner. The web detail dialog's Summary tab renders `Slug`, `Lead`, `Repository`, `Created`,
`Updated` — no id.

## What to do

1. **The id is readable on every surface that shows container metadata.** Add it to `kampaku projects list`
   / `projects show` and to the web UI's project detail. Read `apps/core/src/cli/projects.ts` (or wherever
   the projects command renders) and the web component that renders the Summary panel; do not invent a
   fourth view for it.
2. **The repository path is the same string on every surface.** The container stores a `file://` url
   (`GET /api/v1/projects/<slug>` → `repositories[].url`). The CLI and the web UI render a bare path today.
   Make the operator-facing surfaces show the string the container holds (the url, with its role), so a
   reader comparing two surfaces is comparing the same value. If you judge the bare path to be the better
   *rendering*, then the API's stored field is what has to change — either way, one string, three surfaces.
   Say in your report which direction you took and why.
3. **A lock for each half**, in the files the suite already names rather than a new spec file:
   `apps/core/tests/eval/eval-work-order-intake.test.ts` and `apps/web/e2e/eval-work-order-intake.spec.ts`.
   `apps/web/e2e/eval-work-order-intake.spec.ts` already asserts the path is present on both surfaces — its
   assertions were inverted when F-034 closed, so extend them rather than replacing them.
4. **Verify the lock is red without the fix.** Revert your change in place, run the lock, capture the
   failure, restore the change, run it green. A lock that was never red proves nothing and will be reported
   as unverified.

## How to deliver

- **Do not commit, and do not run `git commit`.** Leave your change in the working tree on `develop`; the
  session that owns this row takes one reviewable commit at the end. Report the exact file list.
- Report, in your reply: what you changed and why, the direction you took on point 2, the commands you ran,
  the red-without-the-fix output quoted, the green output quoted, and anything you found that you did
  **not** fix.
- Run the narrow files, not the whole suite: `cd apps/core && npx vitest run tests/eval/eval-work-order-intake.test.ts`
  and the web spec through the repo's Playwright project. If a full-suite run is needed for confidence, say
  so; do not start one unattended.
- If the honest fix turns out to be larger than this row — a layer change, a migration, a product decision —
  **stop and say so** instead of widening the change. That is a legitimate answer and it is better than a
  fix nobody can review.

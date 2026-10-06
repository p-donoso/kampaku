# F-110 — the documented first run does not reach a factory that can accept a turn

You are working in `/home/pdonoso/kampaku` on the **develop** branch. Suite 01 of the eval lab
(`docs/eval/01-work-order-intake.md`) measured this on run `s01r8`, on a fresh data dir, on 2026-10-05.

## Read first

- `docs/eval/results/BOARD.md` § F-110 (the row this chat owns).
- `README.md` § Quick start, and `scripts/start.sh`, `scripts/install.sh`, `apps/core/src/cli/commands/dev.ts`,
  `apps/core/src/cli/commands/serve.ts`, `apps/core/src/cli/commands/bootstrap.ts`,
  `apps/core/src/cli/repl.ts` (`ensureChatPreflight`).
- The run's readings: `.kampaku/runs/s01r8/logs/p0-before-cli.txt` and `s01r8-before-platform.txt`.

## The three legs, as measured — reproduce each before you change anything

1. **The Quick start never names `bootstrap`.** `README.md` § Quick start is clone → `npm install` →
   `cp .env.example .env` → verify → `./scripts/kampaku dev`. Nothing there creates the default project.
2. **`serve` does not create it either.** `GET /api/v1/projects` answered `{"projects":[]}` on this run's fresh
   Core, `bootstrap_state` held no `default_project`, and the instance had 9 agents and 0 projects.
   `serve.ts` bootstraps the platform **team** and the projects folder; `bootstrapKampakuProject` has exactly
   one caller, the `bootstrap` command. `ensureChatPreflight` then refuses a turn with
   *"No project found. Run `kampaku bootstrap` first."* — measured in code, and the state it refuses on is
   the state the start path produced.
3. **`scripts/install.sh` runs a script that does not exist.** Line 19 is `npm run bootstrap`; the root
   `package.json` defines no `bootstrap` script, and `npm run bootstrap` answers
   `npm ERR! Missing script: "bootstrap"`. `scripts/start.sh` points an operator at `install.sh` when build
   output is missing, so this is a documented path whose last step cannot run.

Cost on this run: the stack came up healthy (Core, worker, web, `/api/v1/health` ok, `workersOnline: 1`) and
**no chat turn could be driven** until the operator ran `node apps/core/dist/cli.js bootstrap` by hand. That
is the factory's front door failing for a stranger following the public docs.

## What to do

1. **Make the first-run path reach a factory that accepts a turn, and make it honest.** The preferred shape is
   the non-creating one: the documented start path **states** the step it needs and verifies it, rather than
   silently creating a container behind the operator — suite 01's own oracle reads a fresh instance's
   contents, so a start path that quietly writes a project changes what that suite measures.
   Concretely: fix `install.sh`'s missing script; have `dev`/`start.sh` check whether a default project
   exists and, if not, print the exact command and the one line of why (the same honesty `ensureChatPreflight`
   already shows); and put `kampaku bootstrap` into the README's Quick start **before** the start command.
2. **Do not make `serve` or `dev` create the default project as a side effect of an unrelated call.** If you
   conclude that the right answer *is* to create it, do not implement that here: say so in your report with
   your reasoning and leave the row open, because that is a product decision about what starting the stack
   means and it belongs to the emperor, not to a fix chat.
3. **A lock**, in a file whose subject is the boot path rather than a new spec for one line: `dev`/`serve`'s
   own tests, or `apps/core/tests/eval/eval-stack-liveness.test.ts`, or a new `apps/core/tests/eval/` file
   that drives the CLI's preflight against a Core with no default project. `eval-local-ports.test.ts` is the
   local model for "hold the script to the behaviour by text" if the check is in `scripts/`.
4. **Verify the lock is red without the fix.** Revert in place, run it, capture the failure, restore, run it
   green. A lock that was never red proves nothing.

## How to deliver

- **Do not commit, and do not run `git commit`.** Leave your change in the working tree on `develop`; the
  session that owns this row takes one reviewable commit at the end. Report the exact file list.
- Do **not** run `scripts/install.sh` end to end — it runs `npm ci` and a full build, which would rebuild the
  tree under a live measurement. Measure the failing line only (`npm run bootstrap`) and change the script.
- Report, in your reply: the three legs reproduced with their commands and output, what you changed, the
  red-without-the-fix output quoted, the green output quoted, and anything you found that you did not fix.
- Keep it narrow. A one-line README omission and a one-line missing script do not justify a refactor of the
  start path, and a fix that moves the layer suite 01 measures will be reverted and the row left open.

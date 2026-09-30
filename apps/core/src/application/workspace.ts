/**
 * @module application/workspace
 * The folder the factory works in, and what the agents are told about it.
 *
 * The setting itself is `AppConfig.projectsDir` (`KAMPAKU_PROJECTS_DIR`). This module answers the two
 * questions that setting raises for the rest of the runtime: does the directory exist, and does the model
 * know the path?
 *
 * Why the second question is a function rather than a sentence in a prompt file: a path cannot live in a
 * static prompt, and a prompt that names a folder the runtime never created is the defect this repository
 * keeps recording — an instruction with nothing behind it. The guidance and the directory are produced from
 * one value, so they cannot disagree.
 */

import { existsSync, mkdirSync } from "node:fs";

/**
 * Creates the projects folder if it is absent, and reports whether it had to.
 *
 * `mkdir -p` semantics, and idempotent: calling it on a folder that exists is a no-op that reports
 * `created: false`, because an operator running `bootstrap` twice must not be told a directory was made on
 * the second run.
 *
 * It is called from the two operator startup paths (`kampaku bootstrap`, `kampaku serve`) and from nowhere
 * else. The default points at the operator's home, so a library call that created it would mean every test
 * suite and embedded caller could write a directory into `/home/<operator>` — a side effect nobody asked
 * for, on the machine of the person who did not ask.
 */
export function ensureProjectsDir(dir: string): { path: string; created: boolean } {
  if (existsSync(dir)) return { path: dir, created: false };
  mkdirSync(dir, { recursive: true });
  return { path: dir, created: true };
}

/**
 * What every agent is told about where the work lives.
 *
 * Two things have to be in it, and both are consequences of refusals the product already makes:
 *
 * - **the path**, so a proposed checkout is `<projectsDir>/<slug>` rather than an improvised absolute path
 *   in the operator's home folder;
 * - **that the factory does not create it**, because `create_project` refuses a `file://` path that does not
 *   exist (deliberately — that refusal is what stops a stored link to a directory nobody made). Without this
 *   sentence the model's reasonable next move is to say it will create the checkout, which no seat can do,
 *   and that sentence is the same defect class as an invented result.
 */
export function projectsDirGuidance(projectsDir: string): string {
  return (
    `\n\nThe folder this factory works in is ${projectsDir}. A new project's checkout belongs there, in a ` +
    `directory named after the project's slug — ${projectsDir}/<slug> — so propose that path rather than an ` +
    "absolute path somewhere else in the operator's home. Nothing in the factory creates that directory: " +
    "opening a work order links a checkout that already exists and refuses a path nobody made. So when you " +
    "propose it, give the exact path and say it has to exist first (`mkdir -p <path>`); never say a checkout " +
    "was created or written when only the link was stored."
  );
}

/**
 * @module job-runner/repository-path
 *
 * **One path, read once: the checkout this job writes to.**
 *
 * The worker had two answers to that question and they disagreed. The filesystem-policy check built its target
 * from the job's **role** — `workspaceRoot` + `apps/core` for a platform job — while `createSandbox` twenty
 * lines later used the job's own `repositoryPath` when it carried one. For the platform's own work the two are
 * the same directory, so nothing showed. For a leased external checkout they are different projects.
 *
 * Measured 2026-11-23 on suite 19 run `s19r19`: three jobs on the legacy scenario's first leaf, each carrying
 * `repositoryPath: /home/pdonoso/kampaku-projects/s19r19/legacy-ledger`, each failed
 * `FILESYSTEM_POLICY: Path is outside allowed folders: /home/pdonoso/kampaku/apps/core` — a path none of them
 * would write to. The boundary answered about the platform's monorepo because the workspace root and the grant
 * list named different checkouts.
 *
 * The same gap in the other direction is the one that matters: a job whose real checkout is outside every grant
 * was **allowed** whenever the role's directory happened to be inside one, and then the sandbox symlinked the
 * ungranted checkout anyway. A policy checked against a different path than the one written is not a policy.
 */

import { join } from "node:path";
import { REPOSITORY_DIRS } from "../config.js";

/** The fields of a leased job's input that decide where its work lands. */
export interface JobRepositoryInput {
  repositoryRole: string;
  /** The checkout this job was leased to work in, when its project is not the platform's own monorepo. */
  repositoryPath?: string;
}

/**
 * The absolute path this job will write to.
 *
 * `repositoryPath` when the job carries one — an external project's checkout, which Core resolves from the
 * project's linked repository — and `workspaceRoot` + the role's directory otherwise, which is the platform's
 * own monorepo. `createSandbox` resolves the same way, so the policy check and the sandbox cannot name
 * different directories.
 */
export function jobRepositoryPath(input: JobRepositoryInput, workspaceRoot: string): string {
  const carried = input.repositoryPath?.trim();
  if (carried) return carried;
  const dir = REPOSITORY_DIRS[input.repositoryRole as keyof typeof REPOSITORY_DIRS];
  return dir ? join(workspaceRoot, dir) : workspaceRoot;
}

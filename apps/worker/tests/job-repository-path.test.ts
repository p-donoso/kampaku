import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPathWritable } from "../src/sandbox/path-policy.js";
import { jobRepositoryPath } from "../src/job-runner/repository-path.js";

/**
 * **The path a policy is judged against must be the path the job writes to.**
 *
 * Measured 2026-11-23 on suite 19 run `s19r19`, three jobs in a row, on the legacy scenario's first leaf: every
 * one of them failed `FILESYSTEM_POLICY: Path is outside allowed folders: /home/pdonoso/kampaku/apps/core`,
 * while the same job's own `repositoryPath` was `/home/pdonoso/kampaku-projects/s19r19/legacy-ledger` — the
 * checkout it was leased to repair. The worker computed the path to check from the **role** (`workspaceRoot` +
 * `apps/core`) and handed the **job's** path to `createSandbox` twenty lines later, so the boundary answered
 * about a directory the job would never touch.
 *
 * Both directions of that gap are defects, and the second is the dangerous one:
 *
 * - a job whose real checkout is granted is **refused** because the platform's own monorepo directory is not;
 * - a job whose real checkout is **outside** the grants is **allowed** because the role's path happens to be
 *   inside them — the check passes, and the sandbox symlinks the ungranted checkout anyway.
 *
 * So the path is read once (`jobRepositoryPath`) and used by both the policy check and the sandbox.
 */
describe("the path a job's filesystem policy is judged against (suite 19 / s19r19)", () => {
  let workspaceRoot: string;
  let external: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), "kampaku-workspace-"));
    external = mkdtempSync(join(tmpdir(), "kampaku-external-"));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  });

  it("is the checkout the job carries, not the role's directory in the platform monorepo", () => {
    expect(jobRepositoryPath({ repositoryRole: "core", repositoryPath: external }, workspaceRoot)).toBe(external);
  });

  it("falls back to the role's directory when the job carries no path, which is the platform's own case", () => {
    expect(jobRepositoryPath({ repositoryRole: "core" }, workspaceRoot)).toBe(join(workspaceRoot, "apps/core"));
    expect(jobRepositoryPath({ repositoryRole: "web" }, workspaceRoot)).toBe(join(workspaceRoot, "apps/web"));
  });

  it("does not refuse a granted checkout because the platform's own directory is outside the grants", () => {
    // The measured shape: grants cover the external project, the platform checkout the role names is elsewhere.
    const policy = { folders: [{ path: external, readOnly: false }] };
    const resolved = jobRepositoryPath({ repositoryRole: "core", repositoryPath: external }, workspaceRoot);
    expect(() => assertPathWritable(resolved, policy)).not.toThrow();
  });

  it("refuses a checkout outside the grants, which the role path was hiding", () => {
    // The dangerous direction: the role's directory is granted, the job's checkout is not.
    const policy = { folders: [{ path: join(workspaceRoot, "apps/core"), readOnly: false }] };
    const resolved = jobRepositoryPath({ repositoryRole: "core", repositoryPath: external }, workspaceRoot);
    expect(() => assertPathWritable(resolved, policy)).toThrow(/outside allowed folders/);
  });
});

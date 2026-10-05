/**
 * @module tools/job-ledger
 *
 * What a job landed, read from the job's own durable record **and checked against the checkout**.
 *
 * Why this exists, measured 2026-10-04 in suite 08's fifth re-run (`s08r12`), on the suite's prompt 3 —
 * *"Which files did you create or change, and which check proves each one?"*:
 *
 *   * every job carried a correct, durable `filesChanged` — `52d2a06b` → `src/textstats/cli.py`,
 *     `src/textstats/__main__.py`; `be0ac35f` → `tests/fixtures/sample.txt`, `tests/test_cli.py`;
 *     `0c3ea6ec` → `README.md`, `AGENTS.md` — and the filesystem agreed with all three to the byte;
 *   * and the front office answered *"I created no files and changed none … The paths are declarations, not
 *     a landed-file list. I have not read a list of files changed on the checkout."*
 *
 * Both sentences were true of the seat that said them: it holds `get_project`, `get_agent_dashboard` and
 * `get_project_journal`, and **none of the three can read a job** ([BOARD F-053](../../../../../docs/eval/results/BOARD.md)).
 * That is the defect this tool closes, and the shape of it matters: the reply was not a fabrication, it was
 * an honest description of a toolset that cannot answer the one question the suite asks about traceability.
 *
 * Three rules, each a decision:
 *
 * 1. **A claim is not a landed file.** Every path in a job's `filesChanged` is resolved against the checkout
 *    the job ran in and reported as it is found: on disk, or claimed but missing. A tool that echoes the
 *    field would let the product answer a question it has not verified — and `s08r12`'s four named files
 *    being present is exactly what would have made that answer right *by luck*.
 * 2. **The other direction too.** The reply's file list is only half the oracle: *present but unclaimed* is
 *    the other half (BOARD F-090, F-097). So a project read also reports the paths **changed on the checkout
 *    that no job claims**, read from the checkout's own version control rather than guessed.
 * 3. **What cannot be checked is said, and says what it needs.** No checkout path recorded, a checkout this
 *    process cannot read, a checkout under no version control: each is reported as the reason the half could
 *    not be produced, never smoothed into an empty list. An answer that cannot be produced is still usable
 *    when it names its missing input; a fabricated one is not.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { JobRecord } from "../../../persistence/store.js";
import type { KampakuToolContext } from "./index.js";

export interface GetJobLedgerArgs {
  /** The container whose jobs are read. Its slug or id. Exactly one of this and `job_id` is required. */
  project_slug_or_id?: string;
  /** A single job by id, when the caller already has one (the project overview puts it on the work item). */
  job_id?: string;
}

/** One path a job claimed it wrote, with what the filesystem says about it. */
export interface LedgerClaim {
  path: string;
  /** `"file"` or `"directory"` when it is on disk; `"missing"` when it is not; `"unchecked"` when no readable checkout was available. */
  onDisk: "file" | "directory" | "missing" | "unchecked";
}

export interface JobLedgerEntry {
  jobId: string;
  status: string;
  workItemId: string | null;
  workItemTitle: string | null;
  repositoryPath: string | null;
  /** The paths the job reported writing **and that were found on disk** — the landed set. */
  landedFiles: string[];
  /** Claimed, and not on disk. This is *claimed but missing*, and it is a failed claim rather than a detail. */
  claimsWithoutAFile: string[];
  /** Claimed, and nothing could be checked — no checkout path, or a path this process cannot read. */
  unverifiedClaims: string[];
  /** The job's check outcomes, by the name the repository declares them under. */
  checks: Array<{ name: string; passed: boolean }>;
}

export interface JobLedgerResult {
  scope: { kind: "job" | "project"; value: string };
  project: { id: string; slug: string } | null;
  jobs: JobLedgerEntry[];
  /**
   * Per checkout: paths its version control reports as changed and that no job of this project claims.
   * `paths` is present when the checkout could be read; `needs` says what was missing when it could not.
   */
  unclaimedOnDisk: Array<{ repositoryPath: string; paths: string[]; needs?: string }>;
  /** Every bound and every unavailable read, named rather than trimmed silently. */
  withheld: string[];
}

/** How many jobs, and how many paths per job, the result carries before it says what it left out. */
const MAX_JOBS = 50;
const MAX_PATHS_PER_JOB = 200;

/** One checkout's changed paths, or the reason the read could not be produced. */
interface ChangedPaths {
  paths?: string[];
  needs?: string;
}

/**
 * The paths a checkout's own version control reports as changed — untracked, modified, added, deleted.
 *
 * Read rather than inferred: the comparison the suite's oracle prescribes is *"compare the reply's file list
 * against the filesystem diff, in both directions"*, and a diff needs a baseline the platform does not keep.
 * Version control keeps it, and every checkout the factory seeds is one (`repo-bootstrap` runs `git init`).
 * A checkout that is not under version control, or a host without `git`, gets `needs` instead of a guess.
 *
 * Bounded and non-interactive: no prompt, a ten-second ceiling, and stderr discarded so a repository-less
 * directory cannot print its way into the result.
 */
export function changedPathsInCheckout(root: string): ChangedPaths {
  let output: string;
  try {
    output = execFileSync("git", ["-C", root, "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return {
      needs:
        `a checkout under version control: \`git status --porcelain\` in ${root} could not be read ` +
        `(${message}). The *present but unclaimed* half of this ledger needs a baseline, and version ` +
        "control is the one the checkout already carries.",
    };
  }

  const paths = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // `XY <path>`, and for renames `XY <old> -> <new>`. And git quotes a path holding unusual bytes.
      const body = line.length > 3 ? line.slice(3) : line;
      const arrow = body.lastIndexOf(" -> ");
      const raw = (arrow >= 0 ? body.slice(arrow + 4) : body).trim();
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    })
    .filter((path) => path.length > 0);
  return { paths };
}

/**
 * Whether a changed path is claimed, allowing for a claimed file inside an unclaimed directory.
 *
 * `git status --porcelain` reports a new directory as `tests/fixtures/`, while the ledger names the file
 * `tests/fixtures/sample.txt`. Comparing the strings alone would report every new file as present but
 * unclaimed — a false accusation produced by the tool that exists to avoid exactly that.
 */
export function isPathClaimed(changedPath: string, claimed: ReadonlySet<string>): boolean {
  if (claimed.has(changedPath)) return true;
  if (!changedPath.endsWith("/")) return false;
  return [...claimed].some((path) => path.startsWith(changedPath));
}

function textFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function outputOf(ctx: KampakuToolContext, jobId: string): Record<string, unknown> {
  const result = ctx.store.getJobResult(jobId);
  const output = result?.output;
  return output && typeof output === "object" ? (output as Record<string, unknown>) : {};
}

/**
 * The checkout a job ran in, and the container it belongs to, read off the job's own input.
 *
 * The dispatch path records both (`input.repositoryPath`, `input.project`, `input.context.workItemId`), so
 * this needs no inference — and when a field is absent the answer is `null` rather than the first checkout
 * in sight, because attributing one project's files to another is the same defect one layer along.
 */
function jobAttribution(ctx: KampakuToolContext, job: JobRecord): {
  projectId: string | null;
  workItemId: string | null;
  repositoryPath: string | null;
} {
  const input = (job.input ?? {}) as Record<string, unknown>;
  const project = (input.project ?? {}) as Record<string, unknown>;
  const context = (input.context ?? {}) as Record<string, unknown>;

  const pointerWorkItemId = textFrom(context.workItemId);
  const workItem =
    (pointerWorkItemId ? ctx.pmStore.getWorkItem(pointerWorkItemId) : undefined) ??
    ctx.pmStore.getWorkItemByJobId(job.id);

  const projectId = textFrom(project.id) ?? workItem?.projectId ?? null;

  const output = outputOf(ctx, job.id);
  const repositoryPath =
    textFrom(output.repositoryPath) ?? textFrom(input.repositoryPath) ?? null;

  return { projectId, workItemId: workItem?.id ?? pointerWorkItemId, repositoryPath };
}

/** The work item a job belongs to, when the job's own input no longer points at one. */
function workItemFor(ctx: KampakuToolContext, jobId: string, pointerId: string | null) {
  if (pointerId) {
    const item = ctx.pmStore.getWorkItem(pointerId);
    if (item) return item;
  }
  return ctx.pmStore.getWorkItemByJobId(jobId);
}

/**
 * Every job of a container.
 *
 * Enumerated from the job store rather than from the work items, because the two disagree in exactly the
 * case an operator asks about: an item that paused on a gate has its `jobId` cleared, a cancelled item's
 * job was never linked, and a failed job closed nothing (BOARD F-096, F-093). A ledger that lists only the
 * linked jobs is a ledger that hides the writes nobody is accounting for.
 */
function jobsOfProject(ctx: KampakuToolContext, projectId: string): { jobs: JobRecord[]; unattributable: number } {
  const jobs: JobRecord[] = [];
  let unattributable = 0;
  for (const job of ctx.store.listJobs()) {
    const attribution = jobAttribution(ctx, job);
    if (attribution.projectId === projectId) jobs.push(job);
    else if (!attribution.projectId) unattributable += 1;
  }
  return { jobs, unattributable };
}

/** One job, as the ledger reports it: the claims it made and what the checkout says about each. */
function ledgerEntry(ctx: KampakuToolContext, job: JobRecord): JobLedgerEntry {
  const attribution = jobAttribution(ctx, job);
  const workItem = workItemFor(ctx, job.id, attribution.workItemId);
  const output = outputOf(ctx, job.id);

  const rawFiles = Array.isArray(output.filesChanged)
    ? output.filesChanged.filter((entry): entry is string => typeof entry === "string")
    : [];

  const checkout = attribution.repositoryPath;
  const checkoutReadable = checkout !== null && existsSync(checkout);

  const claims: LedgerClaim[] = rawFiles.map((path) => {
    if (!checkoutReadable) return { path, onDisk: "unchecked" as const };
    // A claim that escapes its checkout is not a landed file, whatever is out there: it is unchecked, and
    // the refusal is deliberate rather than a `resolve()` that quietly reads the host.
    const absolute = isAbsolute(path) ? resolve(path) : resolve(checkout!, path);
    const rel = relative(checkout!, absolute);
    const inside = rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
    if (!inside) return { path, onDisk: "unchecked" as const };
    try {
      const stats = statSync(absolute);
      return { path, onDisk: stats.isDirectory() ? ("directory" as const) : ("file" as const) };
    } catch {
      return { path, onDisk: "missing" as const };
    }
  });

  const checkResults = output.checkResults && typeof output.checkResults === "object"
    ? (output.checkResults as Record<string, unknown>)
    : {};

  return {
    jobId: job.id,
    status: job.status,
    workItemId: workItem?.id ?? null,
    workItemTitle: workItem?.title ?? null,
    repositoryPath: checkout,
    landedFiles: claims.filter((claim) => claim.onDisk === "file" || claim.onDisk === "directory").map((claim) => claim.path),
    claimsWithoutAFile: claims.filter((claim) => claim.onDisk === "missing").map((claim) => claim.path),
    unverifiedClaims: claims.filter((claim) => claim.onDisk === "unchecked").map((claim) => claim.path),
    checks: Object.entries(checkResults).map(([name, passed]) => ({ name, passed: passed === true })),
  };
}

/**
 * What a job reported landing, and what the checkout says about it.
 *
 * Read-only, and reachable by the seat that is asked the question: the front office answers *what changed*
 * from here instead of from the work items' declared paths.
 */
export function executeGetJobLedger(ctx: KampakuToolContext, args: GetJobLedgerArgs): JobLedgerResult {
  const withheld: string[] = [];
  const jobId = textFrom(args.job_id);
  const projectRef = textFrom(args.project_slug_or_id);

  if (!jobId && !projectRef) {
    throw new Error(
      "get_job_ledger needs a job_id or a project_slug_or_id. A ledger names the work it is about: pass " +
        "the container whose jobs to read, or one job by id.",
    );
  }

  const project = projectRef ? ctx.store.getProjectByIdOrSlug(projectRef) : undefined;
  if (projectRef && !project) {
    throw new Error(`Project "${projectRef}" not found, so no job of it can be read.`);
  }

  let jobs: JobRecord[] = [];
  if (jobId) {
    const job = ctx.store.getJob(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found: nothing durable records it.`);
    const attribution = jobAttribution(ctx, job);
    if (attribution.projectId) {
      const scoped = jobsOfProject(ctx, attribution.projectId);
      jobs = scoped.jobs.filter((candidate) => candidate.id === job.id);
      if (jobs.length === 0) jobs = [job];
      if (scoped.unattributable > 0) {
        withheld.push(
          `${scoped.unattributable} job(s) in the store are attributable to no container, so they are not ` +
            "part of the claimed set this ledger compares the checkout against.",
        );
      }
    } else {
      jobs = [job];
      withheld.push(
        `Job ${job.id} records no container, so the *unclaimed* half below is compared against this job's ` +
          "own claims only — another job's writes would read as unclaimed.",
      );
    }
  } else if (project) {
    const scoped = jobsOfProject(ctx, project.id);
    jobs = scoped.jobs;
    if (scoped.unattributable > 0) {
      withheld.push(
        `${scoped.unattributable} job(s) in the store are attributable to no container, so they were ` +
          "skipped: their writes cannot be attributed to a project either.",
      );
    }
  }

  jobs = jobs.sort((a, b) => a.id.localeCompare(b.id));
  const listed = jobs.slice(0, MAX_JOBS);
  if (jobs.length > listed.length) {
    withheld.push(`${jobs.length - listed.length} of ${jobs.length} jobs were not listed here.`);
  }

  // One claimed set per ledger: the union of every claim the jobs under it made, used for both directions
  // of the comparison but never as evidence that anything landed.
  const claimed = new Set<string>();
  for (const job of listed) {
    const output = outputOf(ctx, job.id);
    const raw = Array.isArray(output.filesChanged) ? output.filesChanged : [];
    for (const entry of raw) if (typeof entry === "string") claimed.add(entry.replace(/^\.\//, ""));
  }

  const entries = listed.map((job) => ledgerEntry(ctx, job));

  for (const entry of entries) {
    if (entry.landedFiles.length + entry.claimsWithoutAFile.length > MAX_PATHS_PER_JOB) {
      withheld.push(`Job ${entry.jobId} claimed more than ${MAX_PATHS_PER_JOB} paths; the list was cut.`);
    }
  }

  // Which checkouts this ledger's claims live in, so the *present but unclaimed* half is computed where
  // the writes actually happened rather than against a path the reader guessed.
  const checkouts = [...new Set(entries.map((entry) => entry.repositoryPath).filter((path): path is string => path !== null))];
  const unclaimedOnDisk = checkouts.map((repositoryPath) => {
    if (!existsSync(repositoryPath)) {
      return {
        repositoryPath,
        paths: [],
        needs:
          `a checkout readable from this process: ${repositoryPath} does not exist on this filesystem, so ` +
          "neither half of the comparison could be made there.",
      };
    }
    const changed = changedPathsInCheckout(repositoryPath);
    if (!changed.paths) return { repositoryPath, paths: [], needs: changed.needs };
    return {
      repositoryPath,
      paths: changed.paths.filter((path) => !isPathClaimed(path, claimed)).sort(),
    };
  });

  const entriesWithoutCheckout = entries.filter((entry) => entry.repositoryPath === null);
  for (const entry of entriesWithoutCheckout) {
    if (entry.unverifiedClaims.length === 0) continue;
    withheld.push(
      `Job ${entry.jobId} records no repository path, so its claims could not be checked against disk. ` +
        "What would be needed: the checkout the job ran in.",
    );
  }

  return {
    scope: jobId
      ? { kind: "job", value: jobId }
      : { kind: "project", value: project ? project.slug : String(projectRef) },
    project: project ? { id: project.id, slug: project.slug } : null,
    jobs: entries,
    unclaimedOnDisk,
    withheld,
  };
}

export const GET_JOB_LEDGER_TOOL = {
  type: "function" as const,
  function: {
    name: "get_job_ledger",
    description:
      "What the jobs of a container reported landing, **checked against the checkout on disk**: each job's " +
      "durable `filesChanged` with every path verified to exist or reported as claimed-but-missing, the " +
      "check outcomes it recorded, and the paths changed on the checkout that no job claims (present but " +
      "unclaimed). Use this to answer \"which files did you create or change, and which check proves each " +
      "one?\" — a work item's acceptance criteria are declarations of what it should write, never evidence " +
      "of what it wrote. Pass project_slug_or_id for the container's jobs, or job_id for one job. Read-only.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: {
          type: "string",
          description: "Project slug or UUID whose jobs are read.",
        },
        job_id: {
          type: "string",
          description: "A single job id, when one is already in hand.",
        },
      },
      required: [],
    },
  },
};

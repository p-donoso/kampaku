/**
 * @module application/pm/verify-work-item
 *
 * **Re-executing the check a done work item said it passed.**
 *
 * Why this module exists. Suite 11's promise is that *done* means the stated check was re-executed against the
 * artifact and passed, including after sabotage. The factory could write a check into an acceptance criterion,
 * run it once inside a job, and never run it again: measured 2026-10-21 on suite 11's first run (`s11r1`), leaf
 * `9bcc2eb2` closed `done` with a succeeded job, and four of its criteria — `PYTHONPATH=src python3 -m textstats
 * /nonexistent` exits 2, `git status --porcelain` lists only two paths, and two more — were raised to the
 * emperor as *"cannot be decided by any tool"*, because the worker holds no general command runner (BOARD
 * F-105). Asked to clear them, the front office offered *"Re-run the four commands through the worker and close
 * only on real output"* as its recommended option and then said it held no tool that could (BOARD F-122).
 *
 * Two consequences, and this module is the answer to both:
 *
 * - **A done item could not be re-verified.** Nothing in the product could run a criterion's own command
 *   against the checkout, so a sabotaged artifact left the board green and the only honest answer available to
 *   chat was "I cannot check" — which is why suite 11's sabotage beats were unmeasurable.
 * - **A drifted artifact was invisible.** The job's `checkResults` are a record of what a job saw once; nothing
 *   compared them with the checkout afterwards.
 *
 * What this does, and deliberately does not:
 *
 * - It runs **only commands the work item itself states**: the repository's declared checks for the check names
 *   its criteria name (`declared-checks.ts`, the same table the worker reads), plus the commands the criteria
 *   quote in backticks. A quoted command is run only when its program is on a small allowlist and it carries no
 *   shell metacharacter — anything else is **refused by name**, recorded, and never approximated.
 * - It runs them **as the operator**, in the project's own checkout, with `cwd` there and a bounded timeout. It
 *   is not a tool any agent holds, so it cannot be used to widen a role's capability (suite 04's boundary is
 *   untouched: nothing here is on the front office's tool list, and the route is an operator route beside
 *   `closure` and `release`).
 * - It never *decides* a closure. A failing check **reopens** a `done` item (status changes, journal entry
 *   written, the command and its exit code named) and a passing one closes it back **only when this same
 *   surface reopened it**, so the state machine cannot be used to certify work that was never done.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord, WorkItemStatus } from "../../persistence/pm-store.js";
import type { ProjectRecord } from "../../persistence/store.js";
import { KAMPAKU_AGENT_ID } from "../../agents/definitions.js";
import { resolveDeclaredCheckCommands } from "./declared-checks.js";
import { inferRequiredChecksFromWorkItem } from "./work-item-checks.js";
import {
  listManualEvidenceReviews,
  resolveManualEvidenceReview,
} from "./evidence-review.js";
import { identifyAcceptanceCriteria } from "./acceptance-criteria.js";

/** Programs a quoted criterion command may start with. Anything else is refused, never guessed at. */
const ALLOWED_PROGRAMS = new Set([
  "make",
  "just",
  "python",
  "python3",
  "node",
  "npm",
  "npx",
  "pytest",
  "cargo",
  "go",
  "dotnet",
  "mvn",
  "gradle",
  "./gradlew",
  "ruby",
  "bundle",
  "composer",
  "php",
  "zig",
  "mix",
  "dart",
  "git",
  "test",
  // A criterion's command is often a pipe whose stages are ordinary tools — `printf 'one two one\n' |
  // PYTHONPATH=src python3 -m textstats`. Each stage still runs as argv (no shell), so adding them widens what
  // can be measured without widening what can be executed.
  "printf",
  "echo",
  "cat",
  "grep",
  "sort",
  "head",
  "tail",
  "wc",
  "uniq",
  "cut",
  "tr",
]);

/**
 * Shell metacharacters a criterion command may not carry.
 *
 * `|` is **not** in this list: a pipeline is split into stages and each stage is run as argv with the previous
 * stage's stdout on its stdin, so nothing is ever handed to a shell. Every other form — a redirect, a
 * substitution, a chain — is refused by name, because honouring it would mean running a shell.
 */
const SHELL_METACHARACTER = /[;&><$`(){}\n\r]/;

const MAX_OUTPUT_CHARS = 2_000;
const DEFAULT_TIMEOUT_MS = 180_000;

export interface VerificationCheck {
  /** Neutral name: `test`, `lint`, or `criterion:ac-2` for a command a criterion quotes. */
  name: string;
  command: string;
  /** The file and key that justify the command, or the criterion that quotes it. */
  evidence: string;
  criterionIds: string[];
  /** The stdout lines the criterion states as its expected result, when it states them. */
  expectsStdout?: string[];
}

export interface VerificationRefusal {
  command: string;
  reason: string;
  criterionIds: string[];
}

export interface VerificationCheckOutcome extends VerificationCheck {
  exits: number | null;
  passed: boolean;
  output: string;
  durationMs: number;
  /** Stated output lines the command did not print. A non-empty list fails the check even on exit 0. */
  missingOutput?: string[];
}

export interface VerifyWorkItemResult {
  workItemId: string;
  workItemTitle: string;
  projectId: string;
  repositoryPath?: string;
  statusBefore: WorkItemStatus;
  statusAfter: WorkItemStatus;
  verdict: "passed" | "failed" | "unverifiable";
  checks: VerificationCheckOutcome[];
  refusals: VerificationRefusal[];
  /** The criteria this run's checks proved, with the command and exit code that proved each. */
  provenCriteria: Array<{ criterionId: string; command: string; exits: number | null }>;
  /** True when a `done` item was reopened because a stated check now fails. */
  reopened: boolean;
  /** True when an item this surface had reopened closed again after its checks passed. */
  closed: boolean;
  /** The sentence the operator reads: what ran, what it said, and where the item stands. */
  detail: string;
  journalEntryId?: string;
}

export class VerifyWorkItemError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" = "VALIDATION",
  ) {
    super(message);
    this.name = "VerifyWorkItemError";
  }
}

export interface VerificationRunner {
  (command: string, cwd: string): {
    exits: number | null;
    output: string;
    durationMs: number;
    /** The raw stdout, before it was merged with stderr for the operator's reading. */
    stdoutText?: string;
  };
}

/**
 * The default runner: **argv, not a shell**.
 *
 * A criterion command that needs a pipe or a redirect is refused before it reaches here (`SHELL_METACHARACTER`),
 * so splitting on whitespace cannot change what runs. Quoting inside an argument is honoured for the two forms
 * a plan actually writes — `'…'` and `"…"` — and nothing else is interpreted.
 */
export function runCommandArgv(command: string, cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): {
  exits: number | null;
  output: string;
  durationMs: number;
  stdoutText: string;
} {
  const started = Date.now();
  const stages = command.split("|").map((stage) => stage.trim()).filter(Boolean);
  if (stages.length === 0) return { exits: null, output: "empty command", durationMs: 0, stdoutText: "" };

  let stdin = "";
  let exits: number | null = 0;
  const out: string[] = [];
  for (const stage of stages) {
    const { program, env } = stageProgram(stage);
    const argv = splitArguments(stage);
    const firstProgramIndex = argv.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=\S+$/.test(word));
    if (!program || firstProgramIndex === -1) {
      exits = null;
      out.push("empty command stage");
      break;
    }
    const result = spawnSyncCommand(program, argv.slice(firstProgramIndex + 1), cwd, timeoutMs, stdin, env);
    exits = result.exits;
    if (result.stderr.trim()) out.push(result.stderr.trim());
    if (result.stdout.trim()) out.push(result.stdout.trim());
    stdin = result.stdout;
    if (result.exits !== 0) break;
  }
  const output = out.join("\n").trim();
  return {
    exits,
    output: output.length > MAX_OUTPUT_CHARS ? `${output.slice(0, MAX_OUTPUT_CHARS)}…` : output,
    durationMs: Date.now() - started,
    stdoutText: stdin,
  };
}

function splitArguments(command: string): string[] {
  const argv: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) argv.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) argv.push(current);
  return argv;
}

/**
 * Runs one argv. Kept as a separate function so the process boundary is one place, and so a test can drive the
 * decision logic without spawning anything.
 */
function spawnSyncCommand(
  program: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  input = "",
  extraEnv: Record<string, string> = {},
): {
  exits: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(program, args, {
    cwd,
    timeout: timeoutMs,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    input,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) {
    return { exits: null, stdout: "", stderr: `${result.error.message}` };
  }
  return { exits: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Backticked spans of a criterion: the two forms a plan uses to quote a command or a path. */
function backtickedSpans(text: string): string[] {
  const spans: string[] = [];
  const pattern = /`([^`]+)`/g;
  let match = pattern.exec(text);
  while (match) {
    const span = match[1].trim();
    if (span) spans.push(span);
    match = pattern.exec(text);
  }
  return spans;
}

/**
 * Whether a backticked span is something to **run**, as opposed to a value a criterion quotes as its expected
 * result (`total_words 3`, `one 2`).
 *
 * The test is deliberately narrow, because the failure mode of guessing wrong is loud: a criterion's expected
 * output read as a command produced five refusals of the form *"`one` is not a program this surface runs"* on the
 * first live run of this surface (`s11r3`). A span is an invocation when its first word is a program this surface
 * knows, when it carries a flag, or when it starts with an environment assignment — the three spellings a plan
 * uses when it means "run this".
 */
function looksLikeCommand(span: string): boolean {
  const words = span.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const [program, second] = words;
  // `test -f x` is an existence check, not a command to run: it is answered by reading the path.
  if (program === "test" && /^-[fed]$/.test(second ?? "")) return false;
  if (ALLOWED_PROGRAMS.has(program)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*=\S+$/.test(program)) return true;
  return words.some((word) => /^-[A-Za-z]/.test(word));
}

/** A stage's leading `VAR=value` assignments, and the program that follows them. */
function stageProgram(stage: string): { program: string; env: Record<string, string> } {
  const words = stage.split(/\s+/).filter(Boolean);
  const env: Record<string, string> = {};
  let index = 0;
  while (index < words.length) {
    const match = words[index].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) break;
    env[match[1]] = match[2];
    index += 1;
  }
  return { program: words[index] ?? "", env };
}

function looksLikePath(span: string): boolean {
  if (span.includes(" ")) return false;
  return /[\\/]/.test(span) || /\.[a-z0-9]{1,5}$/i.test(span);
}

/**
 * The output lines a criterion states as its expected result, when it says so in words.
 *
 * `verify` runs a criterion's command and reads its exit code, and an exit code is not the whole claim: a plan
 * writes *"its stdout is exactly the four lines `total_words 3`, `unique_words 2`, `one 2`, `two 1`"*, and a command
 * that prints a different four lines still exits 0. Measured 2026-10-21 on suite 11's beat 3 (`s11r3`): changing a
 * printed label left the board green, because the check the platform ran was the exit code and the criterion asked
 * for the text.
 *
 * So the expected lines are read out of the criterion — the backticked spans that are **not** an invocation — but
 * only when the criterion says its output is what is being compared (`stdout`, `exactly`, `prints`). Where it says
 * nothing of the kind, the exit code is all that is claimed, and the detail says which of the two happened.
 */
export function expectedOutputLines(criterionText: string): string[] {
  const text = criterionText;
  if (!/\bstdout\b|\bexactly\b|\bprints?\b|\boutput\b/i.test(text)) return [];
  const lines: string[] = [];
  for (const span of backtickedSpans(text)) {
    if (looksLikeCommand(span)) continue;
    lines.push(span);
  }
  return lines;
}

/** Which stated output lines the command's stdout did not contain. */
export function missingExpectedLines(expected: string[], stdout: string): string[] {
  const observed = new Set(
    stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  return expected.filter((line) => !observed.has(line.trim()));
}

/** The commands a work item states, and the ones this surface will not run.
 *
 * Ordered as the criteria are written, deduplicated by command string, and never widened beyond the item: a
 * criterion that names `make check` contributes one command, the repository's declaration decides which.
 */
export function planVerification(
  workItem: WorkItemRecord,
  repositoryPath: string | undefined,
): { checks: VerificationCheck[]; refusals: VerificationRefusal[] } {
  const criteria = identifyAcceptanceCriteria(workItem.acceptanceCriteria ?? []);
  const declared = resolveDeclaredCheckCommands(repositoryPath);
  const checks: VerificationCheck[] = [];
  const refusals: VerificationRefusal[] = [];
  const seen = new Set<string>();

  const add = (check: VerificationCheck): void => {
    if (seen.has(check.command)) {
      const existing = checks.find((candidate) => candidate.command === check.command);
      if (existing) {
        existing.criterionIds = [...new Set([...existing.criterionIds, ...check.criterionIds])];
        existing.name = existing.name.startsWith("criterion:") ? existing.name : check.name;
      }
      return;
    }
    seen.add(check.command);
    checks.push(check);
  };

  // 1. The repository's own declared checks, for the check names the item's criteria name. This is what makes
  //    `make check` and `make lint` — the two commands this project's README, CI and Makefile all declare — the
  //    commands that run, rather than a vocabulary invented here.
  for (const name of inferRequiredChecksFromWorkItem(workItem)) {
    const command = declared.find((candidate) => candidate.name === name);
    if (!command) continue;
    const criterionIds = criteria
      .filter((criterion) => criterion.text.includes(command.command.split(" ").slice(-1)[0]))
      .map((criterion) => criterion.id);
    add({ name, command: command.command, evidence: command.evidence, criterionIds });
  }

  // 2. The commands the criteria quote. A criterion that says `` `git status --porcelain` lists only … `` states
  //    its own check, and the operator's surface re-runs exactly that — which is the half suite 11 needs and the
  //    half that was raised to the emperor as a judgement instead.
  for (const criterion of criteria) {
    for (const span of backtickedSpans(criterion.text)) {
      if (!looksLikeCommand(span)) continue;
      if (checks.some((check) => check.command === span)) {
        const existing = checks.find((check) => check.command === span);
        if (existing && !existing.criterionIds.includes(criterion.id)) {
          existing.criterionIds.push(criterion.id);
        }
        continue;
      }
      // Every stage of a pipeline has to be a program this surface runs; otherwise the span is refused whole.
      const stages = span.split("|").map((stage) => stage.trim()).filter(Boolean);
      const outsideAllowlist = stages.find((stage) => {
        const { program } = stageProgram(stage);
        return !ALLOWED_PROGRAMS.has(program);
      });
      if (SHELL_METACHARACTER.test(span) || outsideAllowlist) {
        refusals.push({
          command: span,
          reason: SHELL_METACHARACTER.test(span)
            ? "the command needs a shell (a redirect, a substitution or a chain), and this surface runs argv "
              + "only — run it yourself and record the decision with `kampaku projects closure`"
            : `\`${stageProgram(outsideAllowlist ?? "").program}\` is not a program this surface runs`,
          criterionIds: [criterion.id],
        });
        continue;
      }
      const [program] = span.split(/\s+/);
      if (!ALLOWED_PROGRAMS.has(program)) {
        refusals.push({
          command: span,
          reason: `\`${program}\` is not a program this surface runs`,
          criterionIds: [criterion.id],
        });
        continue;
      }
      add({
        name: `criterion:${criterion.id}`,
        command: span,
        evidence: criterion.text,
        criterionIds: [criterion.id],
        expectsStdout: expectedOutputLines(criterion.text),
      });
    }
  }

  // Deliberately **not** read: `frozenPaths`. A freeze means *do not change this file*, not *this file must
  // exist*, and a plan legitimately freezes a path that a later leaf creates. Reading it as a presence check
  // produced a false accusation on the first live run of this surface (`s11r2`: *"frozen paths missing:
  // tests/test_cli_e2e.py"* on an item whose own checks both passed), which is the error this lab treats as
  // worse than a miss.
  return { checks, refusals };
}

export interface VerifyWorkItemInput {
  workItemIdOrTitle: string;
  /** Who ran it. Required, and never inferred: the verification is the operator's own act. */
  by?: string;
  runner?: VerificationRunner;
  /** Injected in tests so a repository can be checked without a real checkout. */
  now?: () => string;
}

export interface VerifyWorkItemContext {
  pmStore: PmStore;
  journalStore?: JournalStore;
  /** The project the item belongs to, resolved by the caller (the route and the CLI both hold the store). */
  project?: ProjectRecord;
  /**
   * Re-decides an open item's closure against the job already on record, after this run's evidence landed.
   *
   * Injected rather than imported, because the decision belongs to the closure gate (`reevaluateBlockedWorkItemClosure`)
   * and this module's job is the running, not the deciding. A criterion that a command just proved should not need
   * a second job nor a second human decision — the item is open, its evidence is now there, and closure is what
   * says whether that was the last thing missing.
   */
  reevaluate?: (workItemId: string) => { status: WorkItemStatus } | undefined;
}

/** The repository a project's work lives in, as a path, when a `file://` link states one. */
export function projectRepositoryPath(project: ProjectRecord | undefined): string | undefined {
  const primary = project?.repositories?.[0];
  if (!primary || !primary.url.startsWith("file://")) return undefined;
  try {
    return fileURLToPath(primary.url);
  } catch {
    return undefined;
  }
}

/**
 * Re-executes a work item's stated checks against the artifact and reconciles the item's status with the result.
 *
 * The three outcomes, and each one is a state the operator can act on:
 *
 * - **passed** — every stated check exited 0. A `done` item stays done, an item this surface reopened closes
 *   again, and every criterion the checks named is recorded as proven with its command and exit code.
 * - **failed** — at least one did not. A `done` item is **reopened** (`todo`, job link cleared) with the failing
 *   command named, so the board cannot show done while a check fails.
 * - **unverifiable** — the item states no check this surface can run, or the checkout is gone. Nothing is
 *   claimed and nothing changes; the detail says which of the two it is.
 */
export function verifyWorkItem(
  context: VerifyWorkItemContext,
  input: VerifyWorkItemInput,
): VerifyWorkItemResult {
  const item = findWorkItem(context, input.workItemIdOrTitle);
  if (!item) throw new VerifyWorkItemError(`No work item ${input.workItemIdOrTitle}.`, "NOT_FOUND");
  if (!input.by?.trim()) {
    throw new VerifyWorkItemError(
      "A verification names who ran it: `--by <who>`. A check nobody signed is a claim, not a record.",
      "VALIDATION",
    );
  }

  const repositoryPath = projectRepositoryPath(context.project);
  const statusBefore = item.status;
  const now = input.now ?? (() => new Date().toISOString());
  const plan = planVerification(item, repositoryPath);
  if (!repositoryPath || !existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
    return {
      workItemId: item.id,
      workItemTitle: item.title,
      projectId: item.projectId,
      repositoryPath,
      statusBefore,
      statusAfter: statusBefore,
      verdict: "unverifiable",
      checks: [],
      refusals: plan.refusals,
      provenCriteria: [],
      reopened: false,
      closed: false,
      detail: repositoryPath
        ? `The checkout this project links (${repositoryPath}) is not a directory, so nothing can be re-run.`
        : "This project links no file:// repository, so there is no checkout to re-run a check in.",
    };
  }

  if (plan.checks.length === 0) {
    return {
      workItemId: item.id,
      workItemTitle: item.title,
      projectId: item.projectId,
      repositoryPath,
      statusBefore,
      statusAfter: statusBefore,
      verdict: "unverifiable",
      checks: [],
      refusals: plan.refusals,
      provenCriteria: [],
      reopened: false,
      closed: false,
      detail: plan.refusals.length > 0
        ? "No stated check could be run: "
          + plan.refusals.map((refusal) => `\`${refusal.command}\` (${refusal.reason})`).join("; ")
          + "."
        : "This item states no check this surface can run, so nothing is claimed about it.",
    };
  }

  const runner = input.runner ?? runCommandArgv;
  const outcomes: VerificationCheckOutcome[] = plan.checks.map((check) => {
    const result = runner(check.command, repositoryPath);
    // The exit code is not the whole claim when the criterion states the output: a command that prints a
    // different four lines still exits 0, and that is a wrong artifact the board must not call done.
    const missingOutput = check.expectsStdout?.length
      ? missingExpectedLines(check.expectsStdout, result.stdoutText ?? result.output)
      : [];
    return {
      ...check,
      exits: result.exits,
      passed: result.exits === 0 && missingOutput.length === 0,
      output: result.output,
      durationMs: result.durationMs,
      ...(missingOutput.length > 0 ? { missingOutput } : {}),
    };
  });

  const provenCriteria = outcomes
    .filter((outcome) => outcome.passed)
    .flatMap((outcome) =>
      outcome.criterionIds.map((criterionId) => ({
        criterionId,
        command: outcome.command,
        exits: outcome.exits,
      })),
    );

  const failed = outcomes.filter((outcome) => !outcome.passed);
  const verdict: VerifyWorkItemResult["verdict"] = failed.length === 0 ? "passed" : "failed";

  let reopened = false;
  let closed = false;
  let journalEntryId: string | undefined;
  let statusAfter: WorkItemStatus = statusBefore;

  if (verdict === "failed") {
    if (statusBefore === "done") {
      context.pmStore.updateWorkItem(item.id, { status: "todo", jobId: undefined });
      statusAfter = "todo";
      reopened = true;
    }
    journalEntryId = context.journalStore?.append({
      projectId: item.projectId,
      workItemId: item.id,
      kind: "verification_failed",
      fromAgentId: KAMPAKU_AGENT_ID,
      title: `Verification failed: ${item.title}`,
      body: [
        `Re-ran ${outcomes.length} stated check(s) from ${repositoryPath} on ${now()}.`,
        ...outcomes.map(
          (outcome) =>
            `- \`${outcome.command}\` → ${outcome.exits === null ? "did not run" : `exit ${outcome.exits}`}`
            + `${outcome.passed ? "" : " (failed)"}${outcome.output ? `: ${firstLine(outcome.output)}` : ""}`,
        ),
        ...plan.refusals.map((refusal) => `- not run: \`${refusal.command}\` — ${refusal.reason}`),
        reopened
          ? "The item was **done** and is now `todo`: a stated check no longer passes, so it is not done. "
            + "Fix the artifact and re-run this command; the item closes again without re-running the job."
          : "The item was not done, so its status is unchanged.",
      ]
        .filter(Boolean)
        .join("\n"),
      refType: "work_item",
      refId: item.id,
      metadata: {
        verdict,
        repositoryPath,
        statusBefore,
        statusAfter,
        reopened,
        checks: outcomes.map((outcome) => ({
          name: outcome.name,
          command: outcome.command,
          exits: outcome.exits,
          passed: outcome.passed,
          criterionIds: outcome.criterionIds,
        })),
        refusals: plan.refusals,
        verifiedBy: input.by,
        verifiedAt: now(),
      },
    }).id;
  } else {
    // A pass closes the item back only when this surface reopened it: an item that was never done is not
    // certified by a green check, because a check is not the acceptance decision for work nobody reported.
    const previouslyReopened = wasReopenedByVerification(context.journalStore, item.id);
    if (statusBefore !== "done" && previouslyReopened) {
      context.pmStore.updateWorkItem(item.id, { status: "done" });
      statusAfter = "done";
      closed = true;
    }
    void previouslyReopened;
    // An open review for a criterion a command just proved is no longer a decision the emperor owes: the
    // command is the evidence, and a pending card for it is a gate nobody needs to answer (BOARD F-105).
    resolveProvenReviews(context.journalStore, item.id, provenCriteria, repositoryPath, input.by);
    // And an item that was open when the check passed is re-decided against the evidence that just landed:
    // this is what makes re-running a check a complete answer rather than a note beside a refusal. Measured
    // 2026-10-21 on run `s11r2`, where leaf `537be1f1` was blocked on `criteria_without_evidence: ac-1, ac-3`
    // while its artifact was on disk and its commands passed.
    if (statusBefore !== "done" && context.reevaluate) {
      const reconciled = context.reevaluate(item.id);
      if (reconciled?.status === "done") {
        statusAfter = "done";
        closed = true;
      }
    }
    journalEntryId = context.journalStore?.append({
      projectId: item.projectId,
      workItemId: item.id,
      kind: "verification_passed",
      fromAgentId: KAMPAKU_AGENT_ID,
      title: `Verification passed: ${item.title}`,
      body: [
        `Re-ran ${outcomes.length} stated check(s) from ${repositoryPath} on ${now()}; all exited 0.`,
        ...outcomes.map((outcome) => `- \`${outcome.command}\` → exit 0${outcome.output ? `: ${firstLine(outcome.output)}` : ""}`),
        provenCriteria.length > 0
          ? `Criteria proven by an executed command: ${provenCriteria.map((entry) => entry.criterionId).join(", ")}.`
          : "",
        closed ? "The item had been reopened by a failed verification and closes again; no job was spent." : "",
      ]
        .filter(Boolean)
        .join("\n"),
      refType: "work_item",
      refId: item.id,
      metadata: {
        verdict,
        repositoryPath,
        statusBefore,
        statusAfter,
        closed,
        checks: outcomes.map((outcome) => ({
          name: outcome.name,
          command: outcome.command,
          exits: outcome.exits,
          passed: outcome.passed,
          criterionIds: outcome.criterionIds,
        })),
        provenCriteria,
        verifiedBy: input.by,
        verifiedAt: now(),
      },
    }).id;
  }

  return {
    workItemId: item.id,
    workItemTitle: item.title,
    projectId: item.projectId,
    repositoryPath,
    statusBefore,
    statusAfter,
    verdict,
    checks: outcomes,
    refusals: plan.refusals,
    provenCriteria,
    reopened,
    closed,
    detail: describeVerdict(verdict, outcomes, reopened, closed),
    journalEntryId,
  };
}

function describeVerdict(
  verdict: VerifyWorkItemResult["verdict"],
  outcomes: VerificationCheckOutcome[],
  reopened: boolean,
  closed: boolean,
): string {
  if (verdict === "passed") {
    const what = `Re-ran ${outcomes.length} stated check(s); every one exited 0`;
    if (closed) return `${what}. The item had been reopened by a failed verification and is **done** again.`;
    return `${what}.`;
  }
  const failed = outcomes.filter((outcome) => !outcome.passed);
  const parts = failed.map((outcome) =>
    outcome.missingOutput?.length
      ? `\`${outcome.command}\` exited ${outcome.exits ?? "?"} but did not print ${outcome.missingOutput
          .map((line) => `\`${line}\``)
          .join(", ")}`
      : `\`${outcome.command}\` → ${outcome.exits === null ? "did not run" : `exit ${outcome.exits}`}`,
  );
  const sentence = `A stated check no longer passes: ${parts.join("; ")}.`;
  return reopened
    ? `${sentence} The item was **done** and is now \`todo\` — the board does not show done while a check fails. `
      + "Fix the artifact and run this again; it closes without re-running the job."
    : sentence;
}

function firstLine(text: string): string {
  const [line] = text.split(/\r?\n/).filter(Boolean);
  return (line ?? "").slice(0, 200);
}

function findWorkItem(context: VerifyWorkItemContext, idOrTitle: string): WorkItemRecord | undefined {
  const direct = context.pmStore.getWorkItem(idOrTitle);
  if (direct) return direct;
  const projectId = context.project?.id;
  const items = projectId ? context.pmStore.listWorkItemsByProject(projectId) : [];
  return items.find((item) => item.title === idOrTitle)
    ?? items.find((item) => item.id.startsWith(idOrTitle));
}

/** Whether the newest verification recorded for this item is a failure: the only state a pass may close. */
function wasReopenedByVerification(journalStore: JournalStore | undefined, workItemId: string): boolean {
  if (!journalStore) return false;
  const entries = journalStore.listForWorkItem(workItemId, {
    kinds: ["verification_failed", "verification_passed"],
    limit: 20,
  });
  const [newest] = entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return newest?.kind === "verification_failed";
}

/** Resolves the open review of every criterion an executed command just proved, naming the command and exit. */
function resolveProvenReviews(
  journalStore: JournalStore | undefined,
  workItemId: string,
  proven: Array<{ criterionId: string; command: string; exits: number | null }>,
  repositoryPath: string,
  by: string,
): void {
  if (!journalStore || proven.length === 0) return;
  const open = listManualEvidenceReviews(journalStore, workItemId).filter((review) => !review.outcome);
  if (open.length === 0) return;
  const item = journalStore.listForWorkItem(workItemId, { kinds: ["evidence_review_requested"], limit: 1 })[0];
  const projectId = item?.projectId;
  if (!projectId) return;
  for (const review of open) {
    const proof = proven.find((entry) => entry.criterionId === review.criterionId);
    if (!proof) continue;
    resolveManualEvidenceReview(journalStore, {
      projectId,
      workItemId,
      reviewId: review.reviewId,
      reviewerAgentId: KAMPAKU_AGENT_ID,
      outcome: "accepted",
      reason:
        `Proven by an executed check, not by a judgement: \`${proof.command}\` exited ${proof.exits ?? "?"} in `
        + `${repositoryPath} (run by ${by}).`,
    });
  }
}

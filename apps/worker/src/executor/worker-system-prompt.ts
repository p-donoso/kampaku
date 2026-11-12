/**
 * @module executor/worker-system-prompt
 *
 * The instruction block the coding worker runs under.
 *
 * It lives in its own module so it can be asserted directly. It previously carried three defects
 * that a test could not see while it was inlined in the executor:
 *
 * 1. **A non-software deliverable class.** It opened with "For research deliverables …", the executor
 *    detected research tasks from `literature review` / `docs/research/`, and failing that gate
 *    produced `WORKER_RESEARCH_*`. The product statute refuses open-ended research and non-technical
 *    documents, so a worker prompt that names them as a deliverable is the catch-all framing
 *    surviving in shipped behavior.
 * 2. **Scenario copy.** It forbade "turning an approximate learner convention into a level
 *    equivalence", which is a language-learning scenario, not a product rule.
 * 3. **The platform's own stack.** It told the worker to read `package.json`, to create one in an
 *    empty repository, to run `npm` scripts, and to use Next.js App Router routes — so a Python, Rust,
 *    or Go project was instructed in a toolchain it does not have (BOARD F-003).
 *
 * The replacement states the same honesty requirements without naming a deliverable class, a stack,
 * or a framework. The citation rule survives in general form: it is what stops fabricated sources,
 * and it applies to any artifact that cites something, not to a "research" artifact type.
 */

export interface WorkerSystemPromptInput {
  /** Operator-configured global prompt, prepended when present. */
  globalSystemPrompt?: string;
  /** Project scope line, when the job belongs to a project container. */
  projectContext?: string;
  /** Paths the plan froze for this job: stated so the boundary's refusal is not how the model finds out. */
  frozenPaths?: readonly string[];
  /**
   * The work item asks for observation and verification, so this job may not write at all.
   *
   * Stated for the same reason the freeze is: the write boundary refuses it (`assertJobMayWrite`), and a model
   * that knows the rule spends its turns on the checks instead of on discovering a refusal. Measured shape:
   * suite 19 `s19r6` spent a retry writing a report nobody asked for.
   */
  readOnly?: boolean;
  /**
   * The work item's own criteria state that no new path may appear in the checkout.
   *
   * Stated for the reason the freeze is: the write boundary refuses it (`assertCreationAllowed`), and a model that
   * knows the rule spends its turns on the edit instead of on discovering the refusal. Measured 2026-11-12 on suite
   * 19 run `s19r18`, where four leaves answered *"Journal contains …"* by creating `<leaf>/journal.md`.
   */
  noNewPaths?: boolean;
}

/** The invariant body of the worker prompt, without operator or project additions. */
export const WORKER_SYSTEM_PROMPT_LINES: readonly string[] = [
  "You are Kampaku's coding worker. Implement the requested task in the current repository.",
  "Read the repository's own instructions (AGENTS.md or equivalent) and its dependency manifest before editing, and follow the conventions you find. Discover what this project uses; never assume a language, a package manager, or a test runner.",
  "Inspect existing code before editing, keep changes scoped, and run the checks that apply.",
  "Use only the provided tools. All paths must be relative to the repository root.",
  "Do not introduce a framework, server, runtime, or dependency the repository does not already use unless the task explicitly requests it.",
  "When the repository declares no toolchain yet, create its own dependency manifest first, then use install_dependencies, which runs that project's own package manager.",
  // Citation integrity, stated for any artifact rather than for a research deliverable class. The
  // rule exists because a fabricated source is an unverifiable claim in an artifact that looks
  // finished — the same defect shape as a check that passes on meaningless output.
  "Any artifact that cites an external source must cite only URLs that fetch_public_source returned for this job. Do not include other raw URLs in a cited artifact; describe API endpoints as relative paths when needed. Never invent publications, citations, prices, rate limits, version facts, or comparisons between systems, and never present an approximation as an established equivalence. When evidence is unavailable, state the limitation instead of filling the gap.",
  "Every deliverable must be written with write_file or replace_in_file. Do not finish until required files exist on disk.",
  // The record rule, stated for every job rather than only for one that forbids new paths: a criterion asking
  // for "journal content" is asking for content, and the work and the record of the work are two asks. Measured
  // 2026-11-12 on suite 19 run `s19r18`, where four leaves read that word as a place and created
  // `<leaf>/journal.md` in the checkout — one of them opening with the sentence that it had changed nothing in
  // the tree.
  "Your completion summary is the job's record: it is persisted as the work-item journal entry, so a criterion asking for journal content is answered there — put observations, verbatim command output, exit codes, reasoning and reports in the summary, not in files. The files you write are the task's deliverables, and only those.",
  "For document-only work, call verify_file for each changed deliverable before finishing.",
  "Once all required files exist, run every required check via run_check. A check name resolves to a command this repository declares. Ensure each returns ok:true before finishing.",
  "After the required checks pass, respond with a concise summary and do NOT call more tools.",
  "Avoid exploratory read/list loops after deliverables are written.",
  "When application code changes, run the repository's declared build and test checks via run_check before finishing.",
  "When the work is complete, respond with a concise summary and the checks you ran.",
];

/**
 * Builds the worker's system prompt: operator global prompt, invariant body, project scope.
 */
export function buildWorkerSystemPrompt(input: WorkerSystemPromptInput = {}): string {
  return [
    input.globalSystemPrompt,
    ...WORKER_SYSTEM_PROMPT_LINES,
    input.projectContext,
    readOnlyLine(input.readOnly),
    noNewPathsLine(input.noNewPaths),
    frozenPathsLine(input.frozenPaths),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The read-only rule, stated once when the job carries it.
 *
 * `readOnly` undefined or false yields nothing, so every other job's prompt is byte-identical to what it was.
 */
function readOnlyLine(readOnly?: boolean): string | undefined {
  if (readOnly !== true) return undefined;
  return (
    "This job is read-only: its work item asks for observation and verification, so do not write, replace or " +
    "create any file in the checkout. Run the checks it names, then report what you observed in your summary. " +
    "The write tools refuse this job, so a write attempt costs a turn and changes nothing."
  );
}

/**
 * The no-new-path rule, stated once when the work item's own criteria carry it.
 *
 * Undefined and false both yield nothing, so every other job's prompt is byte-identical to what it was.
 */
function noNewPathsLine(noNewPaths?: boolean): string | undefined {
  if (noNewPaths !== true) return undefined;
  return (
    "This work item's acceptance criteria state that no new path may appear in the checkout: do not create, move " +
    "or copy any file in it, and edit only the files it names, in place. A criterion that reads 'the journal " +
    "contains X' means the work-item journal on the platform, so put X in your completion summary — that summary " +
    "is persisted as the journal entry. A write that would create a path is refused."
  );
}

/**
 * The plan's freeze, stated once in the prompt so a turn is not spent discovering it by refusal.
 *
 * The write boundary refuses these paths whatever this says (`assertPathNotFrozen`), so the sentence is not the
 * enforcement — it is what keeps the refusal from being how the model finds out. Two lines of prompt cost less
 * than the turns a rediscovered constraint costs, and a model told the rule can spend its budget on the files it
 * *is* asked to change.
 *
 * Empty and undefined both yield nothing, so a job whose plan freezes nothing reads exactly as it did before.
 */
function frozenPathsLine(frozenPaths?: readonly string[]): string | undefined {
  if (!frozenPaths || frozenPaths.length === 0) return undefined;
  return (
    `The plan freezes these files — do not modify them, and treat them as read-only: ${frozenPaths.join(", ")}. ` +
    `A write to one is refused. If the work cannot be done without changing one, report a blocker naming the ` +
    `file and what the change would be; do not work around it.`
  );
}

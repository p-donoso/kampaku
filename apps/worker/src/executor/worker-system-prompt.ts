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
  return [input.globalSystemPrompt, ...WORKER_SYSTEM_PROMPT_LINES, input.projectContext]
    .filter(Boolean)
    .join("\n\n");
}

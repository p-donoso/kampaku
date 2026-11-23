import type { JobResultRecord } from "../../persistence/store.js";

const MAX_AGENT_CHARS = 512;
/**
 * What the journal keeps of a completion report.
 *
 * It was 4 096, and that number was doing more than bounding a journal entry: it was **editing a leaf's report**, so
 * the sections past the cut were invisible to every reader of the journal — the operator, and the closure gate that
 * reads the report for a criterion about what it quotes. Measured 2026-11-23 on suite 19 run `s19r30`: leaf
 * `1b073ce0`'s job wrote 6 753 characters and the journal kept 4 096, cutting the report in the middle of its own
 * `### ac-4 / ac-5` heading. Four of that leaf's seven criteria ask what the report quotes about `git status`,
 * `git diff`, the style audit and a grep — all four written after the cut (BOARD F-167).
 *
 * Raised rather than removed: a journal entry is read by a person and rendered by a UI, so an unbounded body is its
 * own defect. What changes is that a cut is now **stated**, by `truncateReport` below, so a reader never takes a
 * truncated report for the leaf's whole account of its work.
 */
const MAX_JOURNAL_CHARS = 32_768;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Cuts a report at the journal's bound and **says so**, naming what was dropped.
 *
 * The elision mark of `truncate` is not enough on a report: a reader who is told nothing concludes the leaf had
 * nothing more to say, which is how a truncated report came to be read as a complete one.
 */
function truncateReport(text: string): string {
  if (text.length <= MAX_JOURNAL_CHARS) return text;
  const kept = text.slice(0, MAX_JOURNAL_CHARS);
  const dropped = text.length - kept.length;
  return `${kept}\n\n[report truncated: ${dropped} further character(s) were not recorded. The leaf's own words are kept in full in this entry's \`output.summary\`.]`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function formatCheckResults(checkResults: Record<string, unknown> | undefined): string[] {
  if (!checkResults || Object.keys(checkResults).length === 0) return [];
  const lines = ["Checks:"];
  for (const [script, ok] of Object.entries(checkResults)) {
    lines.push(`- ${script}: ${ok === true ? "pass" : "fail/missing"}`);
  }
  return lines;
}

function formatEvidence(evidence: unknown): string[] {
  if (!Array.isArray(evidence) || evidence.length === 0) return [];
  const lines = ["Evidence:"];
  for (const entry of evidence) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { subjectType?: unknown; subject?: unknown; passed?: unknown; observedAt?: unknown };
    if (typeof record.subject !== "string") continue;
    lines.push(`- ${String(record.subjectType ?? "observation")}: ${record.subject} — ${record.passed === true ? "pass" : "fail"} (${String(record.observedAt ?? "unknown time")})`);
  }
  return lines.length > 1 ? lines : [];
}

function formatAcceptanceCriteria(criteria: string[]): string[] {
  if (criteria.length === 0) return [];
  return ["Acceptance criteria:", ...criteria.map((c) => `- ${c}`)];
}

export function buildCompletionMessages(
  workItem: { title: string; acceptanceCriteria?: string[] },
  result: JobResultRecord,
): {
  agentBody: string;
  agentSummary: string;
  journalBody: string;
} {
  const output = result.output ?? {};
  const rawSummary = typeof output.summary === "string" ? output.summary.trim() : "";
  const status = result.status;
  const title = workItem.title;
  const checkResults =
    output.checkResults && typeof output.checkResults === "object"
      ? (output.checkResults as Record<string, unknown>)
      : undefined;
  const filesChanged = asStringArray(output.filesChanged ?? output.files_changed);
  const iterations = typeof output.iterations === "number" ? output.iterations : undefined;

  const agentParts: string[] = [];
  if (status === "succeeded") {
    agentParts.push(`Completed "${title}".`);
    if (rawSummary) agentParts.push(rawSummary);
  } else {
    agentParts.push(`"${title}" ended with status ${status}.`);
    if (rawSummary) agentParts.push(rawSummary);
  }
  const agentBody = truncate(agentParts.join(" "), MAX_AGENT_CHARS);

  const lines: string[] = [];
  lines.push(`Status: ${status}`);
  lines.push(`Job: ${result.jobId}`);
  if (typeof output.repositoryPath === "string" && output.repositoryPath.trim()) {
    lines.push(`Repository: ${output.repositoryPath.trim()}`);
  } else if (typeof output.repositoryRole === "string" && output.repositoryRole.trim()) {
    lines.push(`Repository role: ${output.repositoryRole.trim()}`);
  }
  if (iterations !== undefined) {
    lines.push(`Iterations: ${iterations}`);
  }
  lines.push(`Finished: ${result.finishedAt}`);
  lines.push("");

  lines.push("## Summary");
  if (rawSummary) {
    lines.push(rawSummary);
  } else if (status === "succeeded") {
    lines.push("Task completed successfully.");
  } else {
    lines.push(`Task finished with status ${status}.`);
  }
  lines.push("");

  if (filesChanged.length > 0) {
    lines.push("## Files changed");
    for (const file of filesChanged) lines.push(`- ${file}`);
    lines.push("");
  }

  const checkLines = formatCheckResults(checkResults);
  if (checkLines.length > 0) {
    lines.push("## Checks");
    lines.push(...checkLines.slice(1));
    lines.push("");
  }

  const evidenceLines = formatEvidence(output.evidence);
  if (evidenceLines.length > 0) {
    lines.push("## Evidence");
    lines.push(...evidenceLines.slice(1));
    lines.push("");
  }

  const acLines = formatAcceptanceCriteria(workItem.acceptanceCriteria ?? []);
  if (acLines.length > 0) {
    lines.push("## Acceptance criteria");
    lines.push(...acLines.slice(1));
    lines.push("");
  }

  if (typeof output.followUps === "string" && output.followUps.trim()) {
    lines.push("## Follow-ups");
    lines.push(output.followUps.trim());
    lines.push("");
  }

  const machineBlock = {
    jobId: result.jobId,
    status,
    checkResults: checkResults ?? {},
    filesChanged,
    iterations,
  };
  lines.push("<!-- completion-json");
  lines.push(JSON.stringify(machineBlock, null, 2));
  lines.push("-->");

  return {
    agentBody,
    agentSummary: truncate(agentBody, MAX_AGENT_CHARS),
    journalBody: truncateReport(lines.join("\n")),
  };
}

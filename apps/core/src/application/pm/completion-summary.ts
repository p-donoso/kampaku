import type { JobResultRecord } from "../../persistence/store.js";

const MAX_AGENT_CHARS = 512;
const MAX_JOURNAL_CHARS = 4096;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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
    journalBody: truncate(lines.join("\n"), MAX_JOURNAL_CHARS),
  };
}

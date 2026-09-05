import type { JobResultRecord } from "../../persistence/store.js";

const MAX_AGENT_CHARS = 140;
const MAX_JOURNAL_SUMMARY_CHARS = 280;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  if (match) return match[1]!;
  const line = trimmed.split(/\n/)[0]?.trim();
  return line && line.length > 0 ? line : trimmed;
}

export function buildCompletionMessages(
  workItem: { title: string },
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

  const agentBody = truncate(
    status === "succeeded" ? `Completed "${title}".` : `"${title}" ended with status ${status}.`,
    MAX_AGENT_CHARS,
  );

  const lines: string[] = [];
  lines.push(`Status: ${status}`);
  lines.push(`Job: ${result.jobId}`);
  if (typeof output.repositoryPath === "string" && output.repositoryPath.trim()) {
    lines.push(`Repository: ${output.repositoryPath.trim()}`);
  } else if (typeof output.repositoryRole === "string" && output.repositoryRole.trim()) {
    lines.push(`Repository role: ${output.repositoryRole.trim()}`);
  }
  lines.push(`Finished: ${result.finishedAt}`);
  lines.push("");

  if (rawSummary) {
    lines.push(truncate(firstSentence(rawSummary), MAX_JOURNAL_SUMMARY_CHARS));
  } else if (status === "succeeded") {
    lines.push("Task completed successfully.");
  } else {
    lines.push(`Task finished with status ${status}.`);
  }

  return {
    agentBody,
    agentSummary: agentBody,
    journalBody: lines.join("\n"),
  };
}

/**
 * The completion report of a run **the platform ended**, rather than the agent.
 *
 * Measured 2026-11-23 on suite 19's run `s19r23`, work item `6975a2d6`: the worker's stall detector ended the job
 * after five iterations without a mutation — the agent had spent them reading the file it had just written and
 * re-running the checkout's check — and the report it recorded was the fixed sentence
 *
 *     Agent stalled after writing deliverables.
 *
 * The job's record carried `filesChanged: ["src/ledger/parse.py"]` and `checkResults: {checks/test_parse.py: true}`,
 * so the work was done and measured; what the fixed sentence destroyed was everything the agent *wrote*. Every
 * criterion of that leaf read "the completion report quotes …", so all five became required operator questions —
 * `ac-1` among them, whose check the same job had run and passed — and each was answered by re-deriving it from the
 * checkout by hand.
 *
 * So a platform-ended run says plainly that the platform ended it, keeps the agent's own last words, and names what
 * the record holds even when there are no words. What it must never be is a sentence standing where the report was.
 */
export function composeInterruptedReport(input: {
  /** What the platform saw and why it stopped the run. One sentence, in the record's own words. */
  reason: string;
  /** The agent's last message with any text in it, verbatim. */
  agentMessage?: string;
  filesChanged?: Iterable<string>;
  checkResults?: Record<string, boolean>;
}): string {
  const files = [...(input.filesChanged ?? [])];
  const checks = Object.entries(input.checkResults ?? {});
  const lines: string[] = [
    "## The platform ended this run",
    "",
    input.reason,
    "",
  ];

  if (input.agentMessage?.trim()) {
    lines.push("## What the agent said last", "", input.agentMessage.trim(), "");
  } else {
    lines.push(
      "## What the agent said last",
      "",
      "The agent sent no final message, so there is nothing to report from it: what follows is the record, which " +
        "is the evidence this job can offer.",
      "",
    );
  }

  lines.push("## What the record holds", "");
  lines.push(
    files.length
      ? `Files changed: ${files.map((path) => `\`${path}\``).join(", ")}`
      : "Files changed: none",
  );
  if (checks.length) {
    lines.push(
      `Checks: ${checks
        .map(([name, passed]) => `\`${name}\` ${passed ? "passed" : "did not pass"}`)
        .join(", ")}`,
    );
  }
  lines.push(
    "",
    "The job's own result is the measurement: `filesChanged`, `checkResults` and `evidence` are recorded beside " +
      "this report and were not written by the agent.",
  );

  return lines.join("\n");
}

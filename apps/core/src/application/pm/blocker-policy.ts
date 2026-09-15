export type BlockerKind = "tool_failure" | "task_failure" | "dependency" | "decision_needed";

export function classifyBlocker(code: string | undefined): BlockerKind {
  if (code?.includes("QUESTION") || code?.includes("DECISION")) return "decision_needed";
  if (code?.includes("DEPEND") || code?.includes("BLOCK")) return "dependency";
  if (code?.includes("TOOL") || code?.includes("CAPABILITY")) return "tool_failure";
  return "task_failure";
}

export function retryDelayMs(attempt: number, baseMs = 1000, maxMs = 60_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

export function shouldRetry(attempt: number, maxAttempts: number, previousCodes: string[], currentCode: string): boolean {
  if (attempt >= maxAttempts) return false;
  const repeats = previousCodes.filter((code) => code === currentCode).length;
  return repeats < 2;
}

import type { CoreClient } from "../client/core-client.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export type ExecutionTarget =
  | { kind: "job"; jobId: string }
  | { kind: "goal"; goalId: string }
  | { kind: "unknown"; id: string };

export async function resolveExecutionTarget(
  client: CoreClient,
  id: string,
): Promise<ExecutionTarget> {
  const trimmed = id.trim();
  const job = await client.getJob(trimmed).catch(() => undefined);
  if (job) return { kind: "job", jobId: trimmed };

  const goal = await client.getGoalAudit(trimmed).catch(() => undefined);
  if (goal) return { kind: "goal", goalId: trimmed };

  return { kind: "unknown", id: trimmed };
}

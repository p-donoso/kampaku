export type IterationOutcome = "completed" | "incomplete" | "blocked" | "iteration_limited";

export interface IterationDecision { outcome: IterationOutcome; nextLimit: number; diagnostic: string }

export function decideIterationOutcome(input: { limit: number; used: number; successfulMutations: number; checksPassed: boolean; blocker?: boolean }): IterationDecision {
  if (input.blocker) return { outcome: "blocked", nextLimit: input.limit, diagnostic: "Execution is blocked; resolve the blocker before retrying." };
  if (input.checksPassed) return { outcome: "completed", nextLimit: input.limit, diagnostic: "Required checks passed." };
  if (input.used >= input.limit) {
    const nextLimit = input.successfulMutations > 0 ? Math.min(input.limit + 5, 50) : input.limit;
    return { outcome: "iteration_limited", nextLimit, diagnostic: input.successfulMutations > 0 ? "Limit reached after progress; retry with a bounded increase." : "Limit reached without progress; investigate before retrying." };
  }
  return { outcome: "incomplete", nextLimit: input.limit, diagnostic: "Execution ended before completion criteria passed." };
}

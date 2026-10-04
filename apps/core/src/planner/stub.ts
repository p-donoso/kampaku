import { z } from "zod";
import type { RepositoryRole } from "../config.js";

export const plannedTaskSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  repositoryRole: z.enum(["core", "worker", "contracts", "docs", "web"]),
  acceptanceCriteria: z.array(z.string()).default([]),
  /** Paths this job must not write; the plan's freeze, already derived where it could be. */
  frozenPaths: z.array(z.string()).default([]),
});

export const plannerOutputSchema = z.object({
  tasks: z.array(plannedTaskSchema).length(1),
});

export type PlannedTask = z.infer<typeof plannedTaskSchema>;

export function planWithStub(
  objective: string,
  repositoryRole: RepositoryRole = "core",
): PlannedTask {
  return {
    title: objective.slice(0, 120),
    prompt: objective,
    repositoryRole,
    acceptanceCriteria: ["Task completed without errors"],
    frozenPaths: [],
  };
}

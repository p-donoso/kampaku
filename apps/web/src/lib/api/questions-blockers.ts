import type { AgentBlockage, AgentQuestion } from "../types";
import { fetchJson } from "./client";

/**
 * Lists questions asked between agents or awaiting emperor decision.
 * @param status - Filter by pending or answered.
 */
export function listQuestions(status: "pending" | "answered" = "pending"): Promise<{ questions: AgentQuestion[] }> {
  return fetchJson(`/api/v1/questions?status=${status}`);
}

/**
 * Submits an answer to a pending question, unblocking dependent execution.
 */
export function answerQuestion(id: string, answer: string): Promise<AgentQuestion> {
  return fetchJson(`/api/v1/questions/${encodeURIComponent(id)}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

/**
 * Lists reported execution blockages across agents.
 * @param status - Filter by pending or resolved.
 */
export function listBlockers(status: "pending" | "resolved" = "pending"): Promise<{ blockers: AgentBlockage[] }> {
  return fetchJson(`/api/v1/blockers?status=${status}`);
}

/**
 * Resolves an agent blockage with a resolution summary.
 */
export function resolveBlocker(id: string, resolution: string): Promise<AgentBlockage> {
  return fetchJson(`/api/v1/blockers/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  });
}

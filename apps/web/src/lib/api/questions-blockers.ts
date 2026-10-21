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
 *
 * `outcome` is the platform's own sentence about what the answer did — including *"nothing was resumed"*
 * when the question names no project, which is every question the front office asks from a chat
 * conversation. It is rendered beside the card, because a card that simply disappears reads as resumed.
 */
export function answerQuestion(id: string, answer: string): Promise<AgentQuestion & { outcome?: string }> {
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

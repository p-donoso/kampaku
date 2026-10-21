/**
 * The CLI's reading of an answer, in one place.
 *
 * The sentence itself lives in the application layer (`application/questions/answer-outcome.ts`) so the CLI,
 * the answer route and the web UI cannot spell one outcome three ways. What belongs **here** is the CLI's own
 * rule about which sentence to print, and it has one:
 *
 *   **The route's sentence wins**, because the route reads the project's execution gate *after* the answer and
 *   the CLI cannot. Measured 2026-10-21 on suite 10's run `s10r4`: the route answered *"The project is still
 *   gated: 1 pending question."* and a CLI that recomputed locally printed *"The project will resume if no
 *   other questions remain."* for the same answer — a claim the gate had just contradicted (BOARD F-007).
 *
 * `describeAnswerOutcome` was a constant before that: "Answer recorded. Sprint resumed when no other questions
 * remain.", printed for every answer including questions with no project and no work item — which is every
 * question the root agent asks from chat. The operator answered, was told the sprint resumed, and nothing
 * resumed at all.
 */
import { describeAnswerOutcome } from "../application/questions/answer-outcome.js";

export { describeAnswerOutcome };

/**
 * What the CLI prints after answering: the platform's sentence when the route supplied one, and the scoped
 * sentence otherwise.
 */
export function answerOutcomeFor(answer: {
  outcome?: string;
  projectId?: string | null;
  workItemId?: string | null;
}): string {
  return answer.outcome?.trim() ? answer.outcome : describeAnswerOutcome(answer);
}

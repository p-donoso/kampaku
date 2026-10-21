/**
 * The CLI's reading of an answer, re-exported from the application layer so the CLI, the answer route
 * and the web UI cannot spell the outcome three ways. See `application/questions/answer-outcome.ts`
 * for why the sentence exists at all.
 */
export { describeAnswerOutcome } from "../application/questions/answer-outcome.js";

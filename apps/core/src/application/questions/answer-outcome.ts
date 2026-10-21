/**
 * Renders what actually happened after a question was answered.
 *
 * One implementation, because the sentence is a claim about the platform's own behaviour and every
 * surface that records the answer has to make the same claim: the CLI prints it, and the answer route
 * returns it so the web UI can render it beside the card that was just answered. Measured 2026-10-21 on
 * suite 10's run `s10r1`: the CLI said *"nothing was resumed — send a chat turn"* while the web UI
 * removed the card and said nothing at all, which reads as "work resumed".
 *
 * The previous message was a constant: "Answer recorded. Sprint resumed when no other questions
 * remain." It was printed unconditionally, including for questions that are not attached to any
 * project or work item — which is every question the root agent asks from chat, because chat
 * conversations carry no `projectId`. In that case nothing resumes at all: the answer is stored and
 * the platform waits for the next chat turn.
 *
 * That mattered because the CLI is the operator's canonical record. An operator who reads "sprint
 * resumed" and waits is waiting for something that will never happen, and the platform told them it
 * would. A canned success message is the same defect shape this platform is being probed for: the
 * letter of a signal satisfied while the thing it stands for is absent.
 *
 * Pure and exported so the wording is testable without a running stack.
 */
export function describeAnswerOutcome(question: {
  projectId?: string | null;
  workItemId?: string | null;
}): string {
  if (question.projectId) {
    return "Answer recorded. The project will resume if no other questions remain.";
  }
  if (question.workItemId) {
    return "Answer recorded. The work item will resume if no other questions remain.";
  }
  return (
    "Answer recorded. This question is not attached to a project or work item, so nothing was " +
    "resumed — send a chat turn for the answer to be acted on."
  );
}

/**
 * What an answer to a **project's** gate did, read from the gate as it stands *after* the answer.
 *
 * The project-scoped sentence used to be a constant — "The project will resume if no other questions
 * remain" — and it was wrong in the measured case: answering releases the items the question froze, but
 * with `autoExecute` off nothing dispatches them, so an operator who read "will resume" and waited was
 * waiting for a job nobody had queued. Measured 2026-10-21 on suite 10's run `s10r2`: the answer to
 * `197dae48` cleared the gate (`gated: false`), the frozen container went back to `todo`, and
 * `queuedJobs` stayed 0.
 *
 * So the sentence is derived: still gated → name the gate; clear and auto-executing → say so; clear and
 * **not** auto-executing → name the surface that dispatches, which is the release command or a chat turn.
 * Naming the surface is the same rule the front office's own prompt carries for actions it cannot take.
 */
export function describeProjectAnswerOutcome(input: {
  slug: string;
  gate: { gated: boolean; detail?: string };
  autoExecuting: boolean;
}): string {
  if (input.gate.gated) {
    return (
      "Answer recorded. The project is still gated: " +
      (input.gate.detail ?? "another question, blocker or rule is still open") +
      "."
    );
  }
  if (input.autoExecuting) {
    return "Answer recorded. The project's gate is clear and it is executing, so the released work continues without you.";
  }
  return (
    "Answer recorded. The project's gate is clear and its work is released, and nothing runs until it is " +
    `dispatched: run \`kampaku projects play ${input.slug}\` (or ask for it in a chat turn).`
  );
}

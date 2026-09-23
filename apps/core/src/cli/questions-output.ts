/**
 * Renders what actually happened after a question was answered.
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

import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 05's web lock, and the **P3** half of the suite's oracle:
 *
 * > The clarification is a durable record where the product claims one: a question asked in this suite is
 * > visible in `questions list` and answerable, or the suite records that the clarification was prose-only
 * > as a finding.
 *
 * > **P3** when the clarification is a durable question
 *
 * The durable half is locked in `apps/core/tests/eval/eval-intent-clarify.test.ts` — the question reaches the
 * store, is readable over REST and through the CLI's client, and can be answered. What only a browser can
 * show is the other half: that the operator can **see and answer** that same question in the UI instead of
 * reaching for a shell.
 *
 * This spec asserts against the **server's own question text** rather than against strings typed here: it
 * asks the core what is pending, then requires the page to render the same prompt for the same id, and to
 * make it answerable. A UI that agreed with itself while disagreeing with the store would pass a hard-coded
 * test and fail an operator.
 *
 * It runs against **any** core that has asked a question — the lab's live instance included — and skips,
 * loudly, when the core holds none, because an instance with nothing pending has nothing for this lock to
 * measure.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;

interface PendingQuestion {
  id: string;
  question: string;
  projectId?: string | null;
  askedByAgentSlug?: string;
  recipientAgentSlug?: string;
}

async function questionsWithStatus(status: "pending" | "answered"): Promise<PendingQuestion[]> {
  const response = await fetch(`${coreURL}/api/v1/questions?status=${status}`);
  expect(response.ok, `GET /api/v1/questions?status=${status} answered ${response.status}`).toBeTruthy();
  const body = (await response.json()) as { questions: PendingQuestion[] };
  return body.questions;
}

/** The question's own prompt, which is the text the operator reads. The tag is allowed to wrap it. */
function promptOf(question: string): string {
  const match = question.match(/<kampaku-question>([\s\S]*?)<\/kampaku-question>/);
  if (!match) return question.trim();
  try {
    const parsed = JSON.parse(match[1].trim()) as { prompt?: string; type?: string };
    return (parsed.prompt ?? question).trim();
  } catch {
    return question.trim();
  }
}

function isTextQuestion(question: string): boolean {
  const match = question.match(/<kampaku-question>([\s\S]*?)<\/kampaku-question>/);
  if (!match) return true;
  try {
    return (JSON.parse(match[1].trim()) as { type?: string }).type === "text";
  } catch {
    return true;
  }
}

test.describe("eval 05 — a durable clarification is visible and answerable in the browser", () => {
  test("renders the question the core holds, and answers it on both surfaces", async ({ page }) => {
    const before = await questionsWithStatus("pending");
    test.skip(
      before.length === 0,
      "This core holds no pending question, so there is no durable clarification for the UI to render. " +
        "Run it against an instance that has asked one (the suite's live run does).",
    );

    // A question answerable from the UI, which every type is — the text ones take an input, the choice ones
    // take a radio. Prefer text so the assertion can use the prompt as the input's accessible name.
    const target = before.find((item) => isTextQuestion(item.question)) ?? before[0];
    const targetPrompt = promptOf(target.question);

    await gotoWithTheme(page, "/", "light");

    // 1. The question the store holds is on the page, in the panel the operator is told to look at.
    const panel = page.locator("#pending-questions-card");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(targetPrompt, { exact: false });

    // 2. The asker is named, so the operator knows who is waiting. Scoped to the question's own card, so a
    //    page that happens to name the agent somewhere else does not satisfy it.
    const card = panel.locator("article").filter({ hasText: targetPrompt }).first();
    await expect(card).toBeVisible();
    if (target.askedByAgentSlug) {
      await expect(card).toContainText(target.askedByAgentSlug, { exact: false });
    }

    // 3. And it is **answerable**: the browser answers it, the card goes, and REST agrees on both statuses.
    //    Scoped to the question's own card, so the answer goes to the question that was read — a page with
    //    five pending questions must not be answered by whichever input the DOM happens to put first.
    const answerBox = card.getByRole("textbox");
    await answerBox.fill("Answered from the browser by the eval web lock.");
    await card.getByRole("button", { name: "Answer" }).click();

    await expect
      .poll(async () => (await questionsWithStatus("pending")).some((item) => item.id === target.id), {
        message: "the question left the pending list after the browser answered it",
      })
      .toBe(false);

    // The answer is a record, not a UI state: the store holds it as answered, and the same route the CLI
    // reads says so.
    const answeredIds = (await questionsWithStatus("answered")).map((item) => item.id);
    expect(answeredIds).toContain(target.id);
  });
});

import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, red } from "../ansi.js";
import { answerOutcomeFor } from "../questions-output.js";

export function registerQuestionsCommand(program: Command) {
  const questions = program.command("questions").description("List and answer pending agent questions");

  questions.command("list").description("List pending questions").action(async () => {
    const client = createCoreClient(createAppContext().config);
    try {
      const items = await client.listQuestions();
      if (!items.length) return console.log(dim("No pending questions."));
      for (const item of items) {
        console.log(`${cyan(item.id)}  ${item.askedByAgentSlug ?? item.askedByAgentId} → ${item.recipientAgentSlug ?? item.recipientAgentId}`);
        console.log(`  ${item.question}`);
        if (item.context) console.log(`  ${dim(item.context)}`);
      }
    } catch (error) {
      console.error(red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  });

  questions.command("answer").description("Answer a question awaiting Kampaku/the emperor")
    .argument("<id>").argument("<answer...>").action(async (id: string, words: string[]) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const answer = await client.answerQuestion(id, words.join(" "));
        // Report what actually happened instead of a canned success line: see questions-output.ts. The
        // route's own sentence wins, because the route reads the project's gate **after** the answer and the
        // CLI cannot: on suite 10's run `s10r2` this printed "the project will resume" for a gate that had
        // just cleared with nothing queued to dispatch it (BOARD F-007).
        console.log(cyan(answerOutcomeFor(answer)));
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}

import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";

/**
 * `kampaku scope` — the expansions a project asked for, and the decision on each one.
 *
 * The surface the emperor uses, and the one suite 12 reads: `list` shows each request with its id, its
 * blast radius and its cost; `approve`/`reject` answer **one** id. That granularity is the whole point —
 * the run that measured this (`s12r1`) parked four expansions as one gate, so no command could approve
 * payments while leaving the mobile app parked.
 *
 * `questions` was the wrong object and is worth naming: a question is a decision an agent needs from its
 * superior, and it is answered by whoever holds it. An expansion is the operator's, it is answered by him
 * alone, and nothing about it is conversational.
 */
export function registerScopeCommands(program: Command): void {
  const scope = program
    .command("scope")
    .description("Inspect and decide the scope expansions a project has asked for");

  scope
    .command("list")
    .description("List scope requests with their id, blast radius and cost")
    .option("--project <slug>", "Only this project's requests")
    .option("--status <status>", "pending | approved | rejected | refused")
    .action(async (options: { project?: string; status?: string }) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.listScopeRequests({ projectSlug: options.project, status: options.status });
      if (result.requests.length === 0) {
        console.log("No scope requests recorded.");
        return;
      }
      for (const request of result.requests) {
        console.log(`${request.id}  ${request.status.padEnd(9)} ${request.domain}  ${request.projectSlug}`);
        console.log(`  would change: ${request.summary}`);
        for (const path of request.blastRadius) console.log(`  touches: ${path}`);
        if (request.cost) console.log(`  cost: ${request.cost}`);
        if (request.decision) console.log(`  decision: ${request.decision}`);
      }
      console.log(
        `\n${result.total} request${result.total === 1 ? "" : "s"}, ${result.pending} pending. ` +
          "One decision answers one request.",
      );
    });

  scope
    .command("show")
    .description("Show one scope request in full")
    .argument("<id>", "Scope request id")
    .action(async (id: string) => {
      const client = createCoreClient(createAppContext().config);
      const result = await client.getScopeRequest(id);
      console.log(JSON.stringify(result.request, null, 2));
    });

  for (const [verb, approve] of [
    ["approve", true],
    ["reject", false],
  ] as const) {
    scope
      .command(verb)
      .description(`${approve ? "Approve" : "Reject"} one scope request by id`)
      .argument("<id>", "Scope request id")
      .option("--decision <words>", "The operator's words, recorded beside the decision")
      .action(async (id: string, options: { decision?: string }) => {
        const client = createCoreClient(createAppContext().config);
        const result = await client.decideScopeRequest(id, { approve, decision: options.decision });
        console.log(
          `${result.request.status}: ${result.request.domain} on ${result.request.projectSlug}. ` +
            `${approve ? "It can now be planned as its own work." : "It stays out of the plan."} ` +
            "Any other request is untouched.",
        );
      });
  }
}

import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { cyan, dim, green, red } from "../ansi.js";
import { CoreClientError } from "../../client/core-client.js";
import { formatRisk, type RiskAction } from "../../application/pm/risk-register.js";

/**
 * `kampaku risks` — read the project's risks and discharge the ones that stop execution.
 *
 * The command exists because the gate did not have one. Measured 2026-10-01 on suite 08 run `s08r7`
 * (BOARD F-084): `play` refused with `open_high_risk` and the operator's only path to the risk it was
 * about was to ask the front office, in chat, to have it disposed of. The disposition actions mirror the
 * agent tool's (`mitigate`, `accept`, `escalate`) and are written through the same code path, so the
 * operator and the lead cannot dispose of a risk by two different rules.
 */
export function registerRisksCommand(program: Command) {
  const risks = program
    .command("risks")
    .description("Read project risks and discharge the ones that stop execution");

  risks
    .command("list")
    .description("List risks, blocking ones first")
    .option("--project <slug>", "Limit to one project")
    .option("--open", "Only risks still open")
    .action(async (options: { project?: string; open?: boolean }) => {
      const client = createCoreClient(createAppContext().config);
      try {
        const items = await client.listRisks(options.project);
        const shown = options.open ? items.filter((risk) => risk.status === "open") : items;
        if (!shown.length) {
          console.log(dim(options.project ? "No risks recorded for this project." : "No risks recorded."));
          return;
        }
        for (const risk of shown) {
          console.log(
            `${cyan(risk.id)}  [${risk.status}]  ${
              risk.blocksExecution ? red("STOPS PLAY") : dim("does not block")
            }  impact=${risk.impact ?? "?"} probability=${risk.probability ?? "?"}`,
          );
          console.log(`  ${risk.title}`);
          if (risk.projectSlug) console.log(`  project ${risk.projectSlug}${risk.workItem ? `  work item ${risk.workItem.id}` : ""}`);
          if (risk.disposition) console.log(`  ${dim(`disposed ${risk.disposition.status}: ${risk.disposition.outcome}`)}`);
        }
        const blocking = shown.filter((risk) => risk.blocksExecution).length;
        if (blocking) {
          console.log(
            dim(
              `\n${blocking} risk(s) stop \`kampaku projects play\`. Read one with: kampaku risks show <id>`,
            ),
          );
        }
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  risks
    .command("show")
    .description("Show one risk: title, description, probability, impact, mitigation, review-at, status")
    .argument("<risk-id>")
    .action(async (riskId: string) => {
      const client = createCoreClient(createAppContext().config);
      try {
        console.log(formatRisk(await client.getRisk(riskId)));
      } catch (error) {
        console.error(red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });

  const dispose = (
    name: string,
    action: RiskAction,
    describe: { outcome: string; acceptedBy: string },
  ) => {
    const command = risks
      .command(name)
      .description(describe.outcome)
      .argument("<risk-id>")
      .requiredOption("--outcome <text>", describe.outcome)
      .action(async (riskId: string, options: { outcome: string; acceptedBy?: string }) => {
        const client = createCoreClient(createAppContext().config);
        try {
          const result = await client.disposeRisk(riskId, {
            action,
            outcome: options.outcome,
            ...(action === "accept" ? { accepted_by: options.acceptedBy ?? "operator" } : {}),
          });
          console.log(
            green(
              `${result.risk.id} is now ${result.disposition.status}. ` +
                `Recorded as journal entry ${result.disposition.updateId}.`,
            ),
          );
          const blocking = result.risk.blocksExecution;
          if (blocking) console.log(dim("This risk still stops play."));
        } catch (error) {
          if (error instanceof CoreClientError) {
            console.error(red(error.message));
            process.exitCode = 1;
            return;
          }
          console.error(red(error instanceof Error ? error.message : String(error)));
          process.exitCode = 1;
        }
      });
    if (action === "accept") {
      command.option("--accepted-by <who>", describe.acceptedBy, "operator");
    }
    return command;
  };

  dispose("mitigate", "mitigate", {
    outcome: "What changed, so the exposure is gone or reduced",
    acceptedBy: "Who accepts the exposure and why",
  });
  dispose("accept", "accept", {
    outcome: "Why the exposure is accepted rather than handled",
    acceptedBy: "Who accepts the exposure (recorded as the accepting actor)",
  });
  dispose("escalate", "escalate", {
    outcome: "Where it went and what the recipient is asked to decide",
    acceptedBy: "Who accepts the exposure and why",
  });
}

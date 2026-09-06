import type { Command } from "commander";
import { createAppContext, createCoreClient } from "../context.js";
import { CoreClientError } from "../../client/core-client.js";
import { red, green } from "../ansi.js";

export function registerPlansCommand(program: Command) {
  const plans = program.command("plans").description("Manage persisted plan approvals");
  plans.command("approve").argument("<project-slug>").requiredOption("--agent <slug>").requiredOption("--reference <reference>").requiredOption("--fingerprint <fingerprint>").requiredOption("--content-hash <hash>").option("--expires-at <iso>").action(async (projectSlug, options) => {
    try { await createCoreClient(createAppContext().config).approvePlan({ agent_slug: options.agent, project_slug: projectSlug, approval_reference: options.reference, plan_fingerprint: options.fingerprint, plan_content_hash: options.contentHash, expires_at: options.expiresAt }); console.log(green("Plan approval persisted.")); } catch (error) { if (error instanceof CoreClientError) { console.error(red(error.message)); process.exit(1); } throw error; }
  });
  plans.command("revoke").argument("<project-slug>").requiredOption("--agent <slug>").requiredOption("--reference <reference>").requiredOption("--fingerprint <fingerprint>").requiredOption("--content-hash <hash>").action(async (projectSlug, options) => {
    try { await createCoreClient(createAppContext().config).revokePlanApproval({ agent_slug: options.agent, project_slug: projectSlug, approval_reference: options.reference, plan_fingerprint: options.fingerprint, plan_content_hash: options.contentHash }); console.log(green("Plan approval revoked.")); } catch (error) { if (error instanceof CoreClientError) { console.error(red(error.message)); process.exit(1); } throw error; }
  });
  plans.command("reporting-status").argument("<work-item-id>").requiredOption("--agent <slug>").option("--project <id>").option("--require-wiki-sync").action(async (workItemId, options) => {
    try {
      const status = await createCoreClient(createAppContext().config).getReportingStatus(workItemId, options.agent, options.project, options.requireWikiSync === true);
      console.log(JSON.stringify(status, null, 2));
    } catch (error) { if (error instanceof CoreClientError) { console.error(red(error.message)); process.exit(1); } throw error; }
  });
}

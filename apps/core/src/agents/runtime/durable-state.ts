import { KAMPAKU_AGENT_ID } from "../definitions.js";
import type { KampakuToolContext } from "./tools/index.js";

/**
 * A compact, authoritative snapshot of durable state, injected into every turn.
 *
 * Why this exists. The probe stalled for four consecutive turns because the agent kept refusing to plan,
 * citing a planning blocker by id. Measured: that blocker was **gone from every durable store** — zero
 * pending questions, zero blockages, zero journal events — and the agent had made **no tool call** to
 * check. It was quoting its own earlier reply, which the conversation replays as history, and treating
 * its own past statement as current fact.
 *
 * That is the conversation poisoning itself, and it is the same failure that produced the fabricated
 * status report (`G-17`): the model's own confident prose becomes its source of truth. Prompt
 * instructions to "verify" are weak against it, because the model has no way to tell which of its
 * remembered sentences still hold.
 *
 * So ground truth is supplied in-band, every turn, with an explicit precedence rule: if an earlier
 * message in this conversation contradicts this block, **this block wins**. It is cheap (one query set
 * per turn) and it removes the need for the model to trust its memory about entities at all.
 */

export interface DurableStateSnapshot {
  projects: Array<{ slug: string; status: string; lead: string | null; repositories: number }>;
  questionsAwaitingEmperor: number;
  questionsAwaitingAgent: number;
  pendingBlockers: number;
  workItemsByProject: Record<string, number>;
}

/** Root agent id: a question whose recipient is this id is awaiting the emperor. */
export function snapshotForPrompt(ctx: KampakuToolContext): DurableStateSnapshot {
  const projects = ctx.store.listProjects();
  const questions = ctx.questionStore?.list("pending") ?? [];
  const blockers = ctx.blockageStore?.list("pending") ?? [];

  const workItemsByProject: Record<string, number> = {};
  for (const project of projects) {
    workItemsByProject[project.slug] = ctx.pmStore.listWorkItemsByProject(project.id).length;
  }

  // A question is "awaiting the emperor" when its recipient is the root agent id — the same convention
  // the store uses, rather than a guess from which fields happen to be set.
  const awaitingEmperor = questions.filter(
    (question) => question.recipientAgentId === KAMPAKU_AGENT_ID,
  ).length;

  return {
    projects: projects.map((project) => ({
      slug: project.slug,
      status: project.status,
      lead: project.projectLeadAgentId ?? null,
      repositories: project.repositories.length,
    })),
    questionsAwaitingEmperor: awaitingEmperor,
    questionsAwaitingAgent: questions.length - awaitingEmperor,
    pendingBlockers: blockers.length,
    workItemsByProject,
  };
}

/** Renders the snapshot as the block injected into the prompt. Pure, so the wording is testable. */
export function renderDurableState(snapshot: DurableStateSnapshot): string {
  const projects =
    snapshot.projects.length > 0
      ? snapshot.projects
          .map(
            (project) =>
              `  - ${project.slug} [${project.status}] lead=${
                project.lead ?? "none"
              } repositories=${project.repositories} workItems=${snapshot.workItemsByProject[project.slug] ?? 0}`,
          )
          .join("\n")
      : "  (none)";

  return [
    "CURRENT DURABLE STATE — authoritative, read from the stores at the start of this turn.",
    "",
    "Projects:",
    projects,
    "",
    `Pending questions: ${snapshot.questionsAwaitingEmperor + snapshot.questionsAwaitingAgent} total.`,
    `Pending blockers: ${snapshot.pendingBlockers}.`,
    "",
    "Rules for using this block:",
    "- It is the only authority on entities and counts. Earlier messages in this conversation may assert",
    "  a project, agent, blocker or question that no longer exists, or never did. If an earlier message",
    "  of yours contradicts this block, THIS BLOCK WINS — do not repeat the earlier claim.",
    "- If you are about to say that something is blocked, missing, or already done, check it here first.",
    "  Do not cite an identifier from memory without confirming it appears above.",
    "- If this block does not contain what you need, call a tool to read it. Do not answer from memory.",
  ].join("\n");
}

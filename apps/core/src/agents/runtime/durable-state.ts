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
  /**
   * The staff, by slug, with who they report to.
   *
   * This was missing, and the omission cost the first baseline run. Asked `what teams exist`, the
   * front office had no authoritative answer inside the block, so it either had to call a tool or
   * answer from memory — and it answered from memory, inventing a five-role web roster while nine real
   * agents existed ([BOARD F-025](../../../../docs/eval/results/BOARD.md)). A question about the
   * factory's own staff is as ordinary as a question about its projects, and a block that answers the
   * second and not the first is what made fabrication the cheapest path.
   */
  agents: Array<{ slug: string; parent: string | null; source: string }>;
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
    agents: ctx.agentStore
      .listAllAgents()
      .map((agent) => ({
        slug: agent.slug,
        parent: agent.parentId
          ? ctx.agentStore.getAgentBySlugOrId(agent.parentId)?.slug ?? null
          : null,
        source: agent.source,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
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

  const agents =
    snapshot.agents.length > 0
      ? snapshot.agents
          .map(
            (agent) =>
              `  - ${agent.slug}${agent.parent ? ` (reports to ${agent.parent})` : " (top level)"} [${agent.source}]`,
          )
          .join("\n")
      : "  (none)";

  // An unowned container is not an open work order, and it is the kind of defect that hides: the
  // project looks present, the operator asked for it, and nothing says it cannot be worked on.
  // Measured in baseline run 2, `intake-demo` was reported as "created successfully" with `lead=none`
  // (BOARD F-005), so the block names it rather than leaving it to be noticed.
  const unowned = snapshot.projects.filter((project) => !project.lead).map((project) => project.slug);
  const unownedNote =
    unowned.length > 0
      ? `\nA container with no accountable owner is not an open work order: ${unowned.join(", ")}. ` +
        "Nobody can approve a plan, own scope, or answer a question about it. Name it to the operator " +
        "and link a lead before treating the work order as open."
      : "";

  return [
    "CURRENT DURABLE STATE — authoritative, read from the stores at the start of this turn.",
    "",
    "Projects:",
    projects,
    ...(unownedNote ? [unownedNote] : []),
    "",
    `Agents: ${snapshot.agents.length} total.`,
    agents,
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
    "- A question about what exists — projects, teams, agents, open work, blockers — is answered from",
    "  this block or from a tool call, never from recollection. If you are about to name an entity that",
    "  does not appear above, either read it with a tool or say that you have not read it.",
  ].join("\n");
}

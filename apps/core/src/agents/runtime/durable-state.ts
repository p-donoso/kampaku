import { KAMPAKU_AGENT_ID } from "../definitions.js";
import { parsePendingQuestion } from "./pending-question.js";
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
  /**
   * The project this conversation is about, when it is about one.
   *
   * Measured in the suite-03 run: asked *"what aspects of **this project** did you staff for?"* against a
   * conversation scoped to `s3-infra`, the reply answered about **`kampaku`** — a different project
   * entirely. The block listed every project and said nothing about which one the operator meant, so "this
   * project" had no referent and the model picked one. The same shape as F-030, where a "show me the
   * container" turn reported the wrong container.
   *
   * `null` is rendered explicitly rather than omitted, because "this conversation is not scoped to a
   * project" is a fact the model needs: without it, a pronoun still looks resolvable.
   */
  activeProject: { slug: string; id: string } | null;
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
  /**
   * The open gates themselves — id, asker, audience and the decision being asked for.
   *
   * A count is not an answer. Measured 2026-09-25 in the suite-05 run: asked *"What must I decide
   * right now?"* with four questions pending against the project, the front office replied *"No
   * decisions are currently tracked in the factory"* and then *"I can't locate them in project
   * journals or work items"* — five tool calls, none of which can enumerate questions, because no
   * tool on its allowlist can. It even carried the store's own count (*"the system shows 4 pending
   * questions"*) while being unable to resolve a single one (BOARD F-050).
   *
   * The same omission is why an asking agent repeats itself. A sub-agent session was built from a
   * system prompt and an objective with no state block at all, so the project lead could not see the
   * question it had already asked, asked it again four minutes later with a fresh id, and blocked its
   * own work twice over (BOARD F-049).
   *
   * So the gates are rendered with their ids and their prompts, and the block says not to re-ask one.
   * Rendered rather than generated, for the same reason every other field here is: the answer already
   * exists in the store, and a model that has to reconstruct it invents.
   */
  openGates: Array<{
    id: string;
    asker: string;
    audience: "emperor" | "agent";
    project: string | null;
    prompt: string;
  }>;
}

/**
 * The lead as a **slug**, not an agent id.
 *
 * Measured in run 7: the block rendered `lead=fdf2b892-382f-46cd-b12f-ab3e437e8f9d` and the reply
 * echoed that uuid verbatim as the project's owner, because it was the only form the block offered. An
 * operator cannot confirm an opaque id, and the same reasoning already applied to `get_project`'s
 * `projectLeadSlug` — a projection an operator is meant to *read* has to name something a person can
 * act on.
 *
 * A lead that cannot be resolved falls back to the id rather than to `null`, on purpose: the id still
 * says a lead is recorded, and `null` would make the unowned-container rule fire for a project that has
 * an owner. A stale reference is a smaller error than a false accusation.
 */
export function resolveLeadSlug(
  agentStore: { getAgentBySlugOrId(idOrSlug: string): { slug: string } | undefined },
  projectLeadAgentId: string | undefined,
): string | null {
  if (!projectLeadAgentId) return null;
  return agentStore.getAgentBySlugOrId(projectLeadAgentId)?.slug ?? projectLeadAgentId;
}

/** Root agent id: a question whose recipient is this id is awaiting the emperor. */
export function snapshotForPrompt(
  ctx: KampakuToolContext,
  activeProjectId?: string,
): DurableStateSnapshot {
  const projects = ctx.store.listProjects();
  const questions = ctx.questionStore?.list("pending") ?? [];
  const blockers = ctx.blockageStore?.list("pending") ?? [];

  const workItemsByProject: Record<string, number> = {};
  for (const project of projects) {
    workItemsByProject[project.slug] = ctx.pmStore.listWorkItemsByProject(project.id).length;
  }

  // A question is "awaiting the emperor" when its recipient is the root agent id — the same convention
  // the store uses, rather than a guess from which fields happen to be set.
  const awaitingEmperorList = questions.filter(
    (question) => question.recipientAgentId === KAMPAKU_AGENT_ID,
  );
  const awaitingEmperor = awaitingEmperorList.length;

  const active = activeProjectId
    ? projects.find((project) => project.id === activeProjectId)
    : undefined;

  return {
    activeProject: active ? { slug: active.slug, id: active.id } : null,
    projects: projects.map((project) => ({
      slug: project.slug,
      status: project.status,
      lead: resolveLeadSlug(ctx.agentStore, project.projectLeadAgentId),
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
    openGates: questions.map((question) => ({
      id: question.id,
      asker:
        ctx.agentStore.getAgentBySlugOrId(question.askedByAgentId)?.slug ?? question.askedByAgentId,
      audience: question.recipientAgentId === KAMPAKU_AGENT_ID ? "emperor" : "agent",
      project:
        projects.find((project) => project.id === question.projectId)?.slug ?? null,
      // The prompt inside the tag, because that is the decision; the raw tag is markup and costs the
      // reader more for less. A question stored without a parseable tag falls back to its own text.
      prompt: parsePendingQuestion(question.question)?.prompt ?? question.question.trim(),
    })),
  };
}

/** Renders the snapshot as the block injected into the prompt. Pure, so the wording is testable. */
/**
 * One project, in resolvable form — the **detail** projection, beside the inventory block.
 *
 * The block compresses on purpose: it renders a container as `slug [status] lead=<slug> repositories=<count>`,
 * because an inventory wants breadth and every turn pays for it. That compression drops exactly the fields
 * an operator asks for when they ask to *see* something — the id is an opaque uuid and a count is not a path
 * — which is measured in the baseline record under *the block is lossy in exactly the fields that were asked
 * for*, and which is why suite 02 forbids a count standing in for the repository path.
 *
 * So the two projections are different jobs, not different sizes of the same job: the block answers "what
 * exists", and this answers "what is this one". Rendering both when a conversation is bound to a project
 * costs a few hundred characters and removes the lossiness where it matters, instead of un-compressing the
 * block for every project on every turn.
 */
export function renderProjectDetail(ctx: KampakuToolContext, projectId: string): string | null {
  const project = ctx.store.getProject(projectId);
  if (!project) return null;
  const lead = resolveLeadSlug(ctx.agentStore, project.projectLeadAgentId);
  const repositories =
    project.repositories.length > 0
      ? project.repositories
          .map((repo) => `  - ${repo.url.replace(/^file:\/\//, "")}${repo.role ? ` (${repo.role})` : ""}`)
          .join("\n")
      : "  (none)";
  return [
    `PROJECT DETAIL — ${project.slug}, read from the stores at the start of this turn.`,
    `  id: ${project.id}`,
    `  name: ${project.name}`,
    `  status: ${project.status}`,
    `  lead: ${lead ?? "none"}`,
    "  repositories:",
    repositories,
  ].join("\n");
}

/**
 * How many open gates are rendered before the block says how many it withheld.
 *
 * Bounded for the same reason the inventory is compressed: every turn pays for this text. Five is well
 * above the one or two gates an ordinary project holds, and the withheld count is stated rather than
 * silently dropped, because a gate the reader cannot see is the defect this rendering exists to fix.
 */
const MAX_RENDERED_GATES = 5;

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
    // Named before the list, because a pronoun in the operator's question resolves to this and to nothing
    // else. When no project is bound the block says so, so "this project" cannot be quietly guessed.
    snapshot.activeProject
      ? `This conversation is about project ${snapshot.activeProject.slug} (id ${snapshot.activeProject.id}). ` +
        "A bare \"this project\" or \"the project\" refers to that one."
      : "This conversation is not scoped to a project. If the emperor says \"this project\", ask which one; " +
        "do not pick from the list below.",
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
    ...(snapshot.openGates.length > 0
      ? [
          "",
          "Open gates — a decision is already recorded and waiting. Each is answerable by id:",
          ...snapshot.openGates
            .slice(0, MAX_RENDERED_GATES)
            .map(
              (gate) =>
                `  - ${gate.id} [${gate.asker} → ${gate.audience}${
                  gate.project ? `, ${gate.project}` : ""
                }] ${gate.prompt}`,
            ),
          ...(snapshot.openGates.length > MAX_RENDERED_GATES
            ? [`  …and ${snapshot.openGates.length - MAX_RENDERED_GATES} more, not shown here.`]
            : []),
        ]
      : []),
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
    // The two rules the suite-05 run left behind. Both are about a gate the reader cannot see: one asked
    // the operator for an id it already had, the other asked the same question twice because nothing told
    // it the first was still open.
    "- The open gates above are decisions that already exist. When the operator asks what they must decide,",
    "  answer from that list by id. Never say that nothing is pending while it is non-empty, and never ask",
    "  the operator to supply an id that is listed there.",
    "- Do not ask a question that is already open above. If yours is there, it is waiting: continue what you",
    "  can, or say plainly that it is blocked on that decision. Re-asking opens a second gate for one",
    "  decision and makes the count useless to the operator.",
  ].join("\n");
}

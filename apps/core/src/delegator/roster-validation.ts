import type { AgentRecord } from "../agents/types.js";
import type { AgentStore } from "../persistence/agent-store.js";
import {
  getProjectTeamAgentIds,
  isAgentEligibleForProject,
  resolveExplicitAssignee,
} from "./agent-scope.js";
import { isContainerPlannedItem, type PlannedWorkItem } from "./types.js";

/**
 * **A criterion that only an author other than the leaf's own can meet.**
 *
 * The requirement is legitimate — a gate signed by the same hand that built the thing is not a gate — and the
 * suite that measured this defect (08, run `s08r12`) had every agent surface behave correctly about it: the
 * lead refused to claim an independent audit it did not have, filed it as a blocker, and the front office
 * escalated it as a decision. What was not legitimate is *where* the plan found that out.
 *
 * The persisted criterion, verbatim, was:
 *
 * ```text
 * The auditor authored none of leaves one to three and modified no file other than its own gate document.
 * ```
 *
 * on a project whose only agent was the author of all of them.
 *
 * **The alternation is what the product was measured writing, not what one plan happened to say.** The first
 * draft of this pattern carried `authored none` and its close paraphrases only, and F-102's own live
 * re-measurement found it too narrow: on the same intent, a real planner wrote the same requirement as
 * *"its signer slug appears in no Phase 1-5 leaf's assignee field"*, *"the signer slug … does not appear among
 * them"*, *"produced by the verifier and not copied from Phase 4"*, and *"no README, source or test file was
 * edited by the verifier"* — every one an authorship-independence requirement, and none of them matched. A
 * requirement a plan can only state in one spelling is not a requirement a checker may read in one spelling.
 *
 * So the pattern has three shapes: an author-exclusion statement (`authored none of`, `does not appear among`,
 * `appears in no`), a named-so-many-authors statement, and a sentence that names a verifying role and a
 * negation — in either order, which is how a sentence is written when the negation is on the verb.
 *
 * It is deliberately read **only when the project cannot field a second seat** ({@link assessPlanRoster}), so a
 * false positive on the wording costs one honest sentence in a response and never a refusal. Widening the words
 * is cheap; refusing a plan that a second seat could satisfy is not.
 */
export const INDEPENDENCE_CRITERION_PATTERN =
  /\bauthored none\b|\b(?:did|does|has|have|had) not author(?:ed)?\b|\b(?:is|was|were) not the author\b|\bnever authored\b|\bappears in no\b|\bdoes not appear (?:in|among)\b|\b(?:is|are|was|were) not among\b|\b(?:an|a) (?:different|separate|other) (?:agent|seat|author|verifier|auditor|signer)\b|\bother than (?:its|the) own (?:author|leaf|hand)\b|\bindependent(?:ly)? (?:verif|review|audit|sign|gate)\b|\b(?:verifier|auditor|reviewer|signer)\b[^.\n]{0,120}\b(?:not|never|no|none|other than|outside)\b|\b(?:not|never|no|none)\b[^.\n]{0,120}\b(?:verifier|auditor|reviewer|signer|independent)\b/i;

/**
 * One thing the plan declared that this project cannot provide.
 */
export interface PlanRosterFinding {
  /**
   * `roster_refused` — the leaf names an owner the project cannot staff, so the owner this plan will persist is
   * not the owner it declared. `criterion_unstaffable` — the leaf's acceptance criteria require a station the
   * project's team cannot contain.
   */
  kind: "roster_refused" | "criterion_unstaffable";
  /** The leaf the finding is about. */
  title: string;
  /** One sentence naming the declared thing, the project's actual roster, and what to do about it. */
  detail: string;
}

/** The owner a leaf will actually get, next to the owner the plan declared for it. */
export interface PlanRosterOwner {
  title: string;
  declared: string;
  /** The slug this project can actually put on the leaf. Absent when this project has no seat at all yet. */
  resolvedSlug?: string;
  reason: string;
}

export interface PlanRosterAssessment {
  /** The items, with every declared owner the project cannot staff replaced by the owner it will actually get. */
  workItems: PlannedWorkItem[];
  /** One entry per item that declared an owner, whether or not it could be honoured. */
  owners: PlanRosterOwner[];
  findings: PlanRosterFinding[];
  /** The block a caller prints in the response the emperor reads. Absent when there is nothing to report. */
  summary?: string;
}

/** Slugs of the seats this project can be worked by: its linked lead and that lead's subtree. */
export function staffableProjectSeats(
  agentStore: AgentStore,
  projectSlug: string | undefined,
  projectLeadSlug: string | undefined,
): AgentRecord[] {
  // A station a project can have is a station **under its own lead**, not merely an agent that is not on the
  // platform team. Measured on the specimen store: `f101-lead`, another work order's lead, is eligible for
  // `textstats` by `isAgentEligibleForProject` (it is neither platform nor the platform slug) and is not
  // accountable to this project — counting it would have made a single-agent project read as staffable, which
  // is exactly the reading that let the run build four leaves against a plan no one could sign.
  if (!projectLeadSlug) return [];
  const ids = getProjectTeamAgentIds(agentStore, projectLeadSlug);
  if (ids.size === 0) return [];
  return agentStore
    .listAllAgents()
    .filter((agent) => ids.has(agent.id) && isAgentEligibleForProject(agent, projectSlug, agentStore));
}

/** Why a declared owner cannot be given this project's work, in words a reader of the plan can act on. */
function whyUnstaffable(
  declared: string,
  projectSlug: string,
  projectLeadSlug: string | undefined,
  agentStore: AgentStore,
): string {
  const direct = agentStore.getAgentBySlugOrId(declared);
  if (!direct) {
    return `no agent with slug "${declared}" exists on this instance`;
  }
  if (!isAgentEligibleForProject(direct, projectSlug, agentStore)) {
    return (
      `"${declared}" is a platform agent and project_slug !== "kampaku" forbids its use on an external ` +
      `project — the apply refuses this, and the refusal is correct policy`
    );
  }
  return `"${declared}" is not accountable to ${projectLeadSlug ?? "this project's lead"}`;
}

function workItemHint(item: PlannedWorkItem): string {
  return [item.title, item.description ?? "", item.suggested_responsibility ?? ""].join(" ");
}

/**
 * **The roster a plan declares, resolved against the project that will own it — before anything is persisted.**
 *
 * This is the fix for the shape BOARD F-102 measured on suite 08's fifth re-run (`s08r12`): the plan previewed
 * four platform stations (`kampaku-fullstack`, `kampaku-qa`, `kampaku-documenter`, `kampaku-auditor`), the
 * apply refused all four, and all four leaves were **quietly re-owned** by the project's single lead while the
 * preview's criteria were persisted unchanged. One of those criteria required an author who was not the leaf's
 * own author, so the last step of the plan could not be signed by anyone the project could staff — and that was
 * discovered four leaves and three succeeded jobs later, as a blocked leaf.
 *
 * Three things happen here, all before the plan is recorded or applied:
 *
 * 1. Every declared owner is resolved through the *same* rules the apply uses (`resolveExplicitAssignee` and the
 *    container rule), so the plan this call returns is the plan the apply would persist. Where the declared
 *    station cannot be given this project's work, the leaf is written to the seat this project actually has —
 *    its lead — and the difference is a finding, not a surprise.
 * 2. Each such substitution is reported with the declared slug, the resolved slug and the policy sentence, so
 *    the emperor reading a preview is told what changed before approving it.
 * 3. A leaf whose acceptance criteria require an author other than its own is checked against the seats the
 *    project can field. On a project with one seat that criterion is unsatisfiable, and the plan says so here,
 *    where it is written.
 *
 * The apply keeps the belt as well as this brace: a preview recorded before this check existed (or a plan
 * edited after its preview) still carries a declared owner the project cannot staff, and
 * `plan-and-delegate.ts` refuses that apply by name rather than persisting the substitution.
 */
export function assessPlanRoster(
  items: PlannedWorkItem[],
  options: { projectSlug: string; projectLeadSlug?: string; agentStore: AgentStore },
): PlanRosterAssessment {
  const { agentStore } = options;
  const projectSlug = options.projectSlug;
  const projectLeadSlug = options.projectLeadSlug;

  const owners: PlanRosterOwner[] = [];
  const findings: PlanRosterFinding[] = [];

  const workItems = items.map((item) => {
    const declared = item.assignee_slug;
    if (!declared) return item;

    // The container rule the apply enforces, read here rather than re-invented: a container is owned by the
    // project lead for coherence oversight whatever the plan declared for it.
    const isContainer = isContainerPlannedItem(item, items);
    const explicit = isContainer
      ? undefined
      : resolveExplicitAssignee(declared, {
          projectSlug,
          projectLeadSlug,
          hint: workItemHint(item),
          agentStore,
        });

    const resolvedSlug = isContainer ? projectLeadSlug : explicit?.agent.slug ?? projectLeadSlug;

    if (resolvedSlug !== declared) {
      // The leaf is written to the seat the project can actually put on it whenever there is one to name. When
      // there is not — a project with no linked lead at all — the declaration stands and the finding is what
      // refuses it, rather than a rewrite to a seat that does not exist.
      const detail = resolvedSlug
        ? `Plan gives "${item.title}" to ${declared}, which this project cannot be worked by — ` +
          `${whyUnstaffable(declared, projectSlug, projectLeadSlug, agentStore)}. ` +
          `It is owned by ${resolvedSlug} instead` +
          `${isContainer ? " (container, owned by the lead for coherence)" : ""}, which is the seat this ` +
          `project actually has. Add the station and preview again if you want the declared owner to do the work.`
        : `Plan gives "${item.title}" to ${declared}, and this project has no seat to give it instead — ` +
          `${whyUnstaffable(declared, projectSlug, projectLeadSlug, agentStore)}, and no lead is linked to ` +
          `the project. Link a lead, or name an owner the project has, and preview again. Nothing was ` +
          `persisted for this plan.`;
      owners.push({ title: item.title, declared, ...(resolvedSlug ? { resolvedSlug } : {}), reason: detail });
      findings.push({ kind: "roster_refused", title: item.title, detail });
      return resolvedSlug ? { ...item, assignee_slug: resolvedSlug } : item;
    }

    owners.push({
      title: item.title,
      declared,
      ...(resolvedSlug ? { resolvedSlug } : {}),
      reason: `Explicit assignee_slug: ${declared}`,
    });
    return item;
  });

  // **A criterion that requires a station the project cannot have is caught where it is written.** The check is
  // read only when the project's team cannot hold two seats, which is the one case where the answer is decidable
  // without knowing what each seat can do: with one seat, the author of the leaf and the author of everything
  // else are the same agent, so no reading of the words can make the criterion satisfiable.
  const seam = staffableProjectSeats(agentStore, projectSlug, projectLeadSlug);
  if (seam.length < 2) {
    const roster = seam.length === 0 ? "no seat at all yet" : seam.map((agent) => agent.slug).join(", ");
    for (const item of items) {
      if (isContainerPlannedItem(item, items)) continue;
      for (const criterion of item.acceptance_criteria ?? []) {
        if (!INDEPENDENCE_CRITERION_PATTERN.test(criterion)) continue;
        findings.push({
          kind: "criterion_unstaffable",
          title: item.title,
          detail:
            `Leaf "${item.title}" carries a criterion that needs an author other than its own — ` +
            `"${criterion}" (verbatim from the plan). This project can be staffed by ${seam.length} seat(s): ` +
            `${roster}. No seat it can have satisfies that criterion, so no one can close this leaf as written. ` +
            `Independent verification is a legitimate requirement; requiring a station the project cannot have ` +
            `is not. Add the station before approving — in a single-agent project that is what an independent ` +
            `gate costs — or restate the criterion so the seat this project has can meet it, and disclose the ` +
            `limitation where it will be read.`,
        });
      }
    }
  }

  const summary =
    findings.length === 0
      ? undefined
      : [
          "Roster check — the plan's own declared owners, resolved against this project before the plan was " +
            "recorded or applied:",
          ...findings.map((finding) => `  - [${finding.kind}] ${finding.detail}`),
        ].join("\n");

  return {
    workItems,
    owners,
    findings,
    ...(summary ? { summary } : {}),
  };
}

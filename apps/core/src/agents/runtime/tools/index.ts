import { appendFileSync } from "node:fs";
import type OpenAI from "openai";
import type { AppConfig } from "../../../config.js";
import type { AgentRecord } from "../../types.js";
import type { AgentStore } from "../../../persistence/agent-store.js";
import type { ConversationStore } from "../../../persistence/conversation-store.js";
import type { PmStore } from "../../../persistence/pm-store.js";
import type { SkillStore } from "../../../persistence/skill-store.js";
import type { Store } from "../../../persistence/store.js";
import type { QuestionStore } from "../../../persistence/question-store.js";
import type { BlockageStore } from "../../../persistence/blockage-store.js";
import type { MemoryStore } from "../../../persistence/memory-store.js";
import type { JournalStore } from "../../../persistence/journal-store.js";
import type { WikiStore } from "../../../persistence/wiki-store.js";
import type { PlanAndDelegateContext } from "../../../application/pm/submit-intent.js";
import type { ToolHandler, ToolExecutionResult } from "./base-tool.js";
import { turnDeadlineFromScope } from "../turn-budget.js";

import { ASK_SUPERIOR_TOOL, executeAskSuperior, type AskSuperiorArgs } from "./ask-superior.js";
import { REPORT_BLOCKER_TOOL, executeReportBlocker, type ReportBlockerArgs } from "./report-blocker.js";
import {
  CONVERT_BLOCKER_TO_QUESTION_TOOL,
  DELEGATE_BLOCKER_TOOL,
  ESCALATE_BLOCKER_TOOL,
  RESOLVE_BLOCKER_TOOL,
  executeConvertBlockerToQuestion,
  executeDelegateBlocker,
  executeEscalateBlocker,
  executeResolveBlocker,
  type ConvertBlockerToQuestionArgs,
  type DelegateBlockerArgs,
  type EscalateBlockerArgs,
  type ResolveBlockerArgs,
} from "./handle-blocker.js";
import {
  ANSWER_QUESTION_TOOL,
  ESCALATE_QUESTION_TOOL,
  executeAnswerQuestion,
  executeEscalateQuestion,
  type AnswerQuestionArgs,
  type EscalateQuestionArgs,
} from "./handle-question.js";
import {
  CREATE_SUB_AGENT_TOOL,
  executeCreateSubAgent,
  type CreateSubAgentArgs,
} from "./create-sub-agent.js";
import {
  DELETE_SUB_AGENT_TOOL,
  executeDeleteSubAgent,
  type DeleteSubAgentArgs,
} from "./delete-sub-agent.js";
import { executeListAgents, LIST_AGENTS_TOOL } from "./list-agents.js";
import {
  executeUpdateSubAgent,
  UPDATE_SUB_AGENT_TOOL,
  type UpdateSubAgentArgs,
} from "./update-sub-agent.js";
import {
  executeSubmitIntent,
  SUBMIT_INTENT_TOOL,
  type SubmitIntentArgs,
} from "./submit-intent.js";
import { executeGetProject, GET_PROJECT_TOOL, type GetProjectArgs } from "./get-project.js";
import {
  executeListProjects,
  LIST_PROJECTS_TOOL,
  type ListProjectsArgs,
} from "./list-projects.js";
import { executeGetJobLedger, GET_JOB_LEDGER_TOOL, type GetJobLedgerArgs } from "./job-ledger.js";
import {
  executeUpdateProject,
  UPDATE_PROJECT_TOOL,
  type UpdateProjectArgs,
} from "./update-project.js";
import {
  executeCreateProject,
  CREATE_PROJECT_TOOL,
  type CreateProjectArgs,
} from "./create-project.js";
import {
  executeUpdateWorkItem,
  UPDATE_WORK_ITEM_TOOL,
  type UpdateWorkItemArgs,
} from "./update-work-item.js";
import {
  executeGetAgentDashboard,
  GET_AGENT_DASHBOARD_TOOL,
  type GetAgentDashboardArgs,
} from "./get-agent-dashboard.js";
import {
  executeListAllowedFolders,
  LIST_ALLOWED_FOLDERS_TOOL,
} from "./list-allowed-folders.js";
import { ASSIGN_SKILL_TOOL, executeAssignSkill } from "./assign-skill.js";
import {
  CREATE_SKILL_TOOL,
  executeCreateSkill,
  type CreateSkillArgs,
} from "./create-skill.js";
import {
  LIST_SKILLS_TOOL,
  executeListSkills,
  type ListSkillsArgs,
} from "./list-skills.js";
import { GET_SKILL_TOOL, executeGetSkill, type GetSkillArgs } from "./get-skill.js";
import { UNASSIGN_SKILL_TOOL, executeUnassignSkill } from "./unassign-skill.js";
import {
  EXECUTE_WORK_ITEM_TOOL,
  executeExecuteWorkItem,
  type ExecuteWorkItemArgs,
} from "./execute-work-item.js";
import {
  RETRY_WORK_ITEM_TOOL,
  executeRetryWorkItem,
  type RetryWorkItemArgs,
} from "./retry-work-item.js";
import { executeRecall, executeRemember, RECALL_TOOL, REMEMBER_LEARNING_TOOL, REMEMBER_LOG_TOOL, type RecallArgs, type RememberArgs } from "./memory.js";
import {
  executeGetProjectJournal,
  executeGetWorkItemJournal,
  executeGetReportingStatus,
  executeProposeAuditImprovement,
  executeProposeDeliverableFinding,
  executeSubmitCompletionReport,
  GET_PROJECT_JOURNAL_TOOL,
  GET_WORK_ITEM_JOURNAL_TOOL,
  GET_REPORTING_STATUS_TOOL,
  PROPOSE_AUDIT_IMPROVEMENT_TOOL,
  PROPOSE_DELIVERABLE_FINDING_TOOL,
  SUBMIT_COMPLETION_REPORT_TOOL,
  type GetProjectJournalArgs,
  type GetWorkItemJournalArgs,
  type GetReportingStatusArgs,
  type ProposeAuditImprovementArgs,
  type ProposeDeliverableFindingArgs,
  type SubmitCompletionReportArgs,
} from "./journal-tools.js";
import {
  APPROVE_WIKI_EDIT_TOOL,
  executeApproveWikiEdit,
  executeGetProjectKnowledge,
  executeGetWikiPage,
  executeGetWikiTree,
  executeListWikiPending,
  executePostWikiComment,
  executeProposeWikiEdit,
  executeProposeWikiPage,
  executeRejectWikiEdit,
  GET_PROJECT_KNOWLEDGE_TOOL,
  GET_WIKI_PAGE_TOOL,
  GET_WIKI_TREE_TOOL,
  LIST_WIKI_PENDING_TOOL,
  POST_WIKI_COMMENT_TOOL,
  PROPOSE_WIKI_EDIT_TOOL,
  PROPOSE_WIKI_PAGE_TOOL,
  REJECT_WIKI_EDIT_TOOL,
  type ApproveWikiEditArgs,
  type GetProjectKnowledgeArgs,
  type GetWikiPageArgs,
  type GetWikiTreeArgs,
  type ListWikiPendingArgs,
  type PostWikiCommentArgs,
  type ProposeWikiEditArgs,
  type ProposeWikiPageArgs,
  type RejectWikiEditArgs,
} from "./wiki-tools.js";
import {
  executeGetGlobalSystemPrompt,
  executeUpdateGlobalSystemPrompt,
  GET_GLOBAL_SYSTEM_PROMPT_TOOL,
  UPDATE_GLOBAL_SYSTEM_PROMPT_TOOL,
} from "./global-system-prompt.js";
import { assertSubAgentParentScope, ledProjectFor } from "./authorization.js";
import {
  executeReadRepository,
  READ_REPOSITORY_TOOL,
  type ReadRepositoryArgs,
} from "./read-repository.js";
import { executeTriageIntent, TRIAGE_INTENT_TOOL, type TriageIntentArgs } from "./triage-intent.js";
import { RefusalStore } from "../../../persistence/refusal-store.js";
import { executeReportRisk, executeUpdateRisk, REPORT_RISK_TOOL, UPDATE_RISK_TOOL, type ReportRiskArgs, type UpdateRiskArgs } from "./risks.js";
import { executeRequestPeerReview, executeSubmitPeerReview, REQUEST_PEER_REVIEW_TOOL, SUBMIT_PEER_REVIEW_TOOL, type RequestPeerReviewArgs, type SubmitPeerReviewArgs } from "./peer-review.js";
import { executeAssessChangeRequest, ASSESS_CHANGE_REQUEST_TOOL, type AssessChangeRequestArgs } from "./change-control.js";
import { executeApprovePlan, executeRevokePlanApproval, APPROVE_PLAN_TOOL, REVOKE_PLAN_APPROVAL_TOOL, type ApprovePlanArgs, type RevokePlanApprovalArgs } from "./plan-approval.js";
import { executeRequestScopeExpansion, REQUEST_SCOPE_EXPANSION_TOOL, type RequestScopeExpansionArgs } from "./scope-request.js";
import { executeGetAgentCapacity, GET_AGENT_CAPACITY_TOOL, type GetAgentCapacityArgs } from "./agent-capacity.js";
import { executeAcceptHandoff, executeRequestHandoff, executeResolveHandoff, ACCEPT_HANDOFF_TOOL, REQUEST_HANDOFF_TOOL, RESOLVE_HANDOFF_TOOL, type AcceptHandoffArgs, type RequestHandoffArgs, type ResolveHandoffArgs } from "./handoff.js";
import { DELEGATE_TO_AGENT_TOOL, executeDelegateToAgent, type DelegateToAgentArgs } from "./delegate-to-agent.js";
import { executePauseProject, executePlayProject, executeStepProject, PAUSE_PROJECT_TOOL, PLAY_PROJECT_TOOL, STEP_PROJECT_TOOL, type ProjectExecutionArgs } from "./project-execution.js";
import { PostActionReviewStore } from "../../../persistence/post-action-store.js";
import type { ScopeRequestStore } from "../../../persistence/scope-request-store.js";
import {
  executeGetPostActionClosure,
  executePostActionReview,
  executeRetryPostActionProjection,
  GET_POST_ACTION_CLOSURE_TOOL,
  POST_ACTION_REVIEW_TOOL,
  RETRY_POST_ACTION_PROJECTION_TOOL,
  type PostActionClosureArgs,
  type PostActionResultArgs,
  type RetryPostActionArgs,
} from "./post-action.js";

export interface KampakuToolContext extends PlanAndDelegateContext {
  agentStore: AgentStore;
  conversationStore: ConversationStore;
  store: Store;
  pmStore: PmStore;
  skillStore: SkillStore;
  config: AppConfig;
  questionStore?: QuestionStore;
  blockageStore?: BlockageStore;
  journalStore?: JournalStore;
  wikiStore?: WikiStore;
  memoryStore: MemoryStore;
  postActionStore?: PostActionReviewStore;
  /** Durable record of out-of-scope work the factory declined. Optional for old callers. */
  refusalStore?: RefusalStore;
  /**
   * Scope expansions parked as separately approvable requests.
   *
   * Optional for the same reason as `refusalStore`: an embedded caller that predates this table keeps
   * working, and `request_scope_expansion` says so instead of silently dropping a request the operator
   * asked for (suite 12, `s12r1`).
   */
  scopeRequestStore?: ScopeRequestStore;
}

export interface ToolRuntimeScope {
  agentId: string;
  conversationId?: string;
  projectId?: string;
  /**
   * When the turn this call belongs to runs out of time, as an epoch millisecond.
   *
   * Carried into tool calls because the budget belongs to the **turn**, not to one session: a tool that
   * starts a delegated session (see `delegate_to_agent`) must hand it down, or the nested session starts
   * a fresh clock and the bound is not a bound. Measured 2026-09-25: a single front-office turn nested
   * enough sessions to run for 40 minutes (BOARD F-048).
   */
  deadlineAt?: number;
}

export const KAMPAKU_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  SUBMIT_INTENT_TOOL,
  DELEGATE_TO_AGENT_TOOL,
  CREATE_PROJECT_TOOL,
  GET_PROJECT_TOOL,
  LIST_PROJECTS_TOOL,
  GET_JOB_LEDGER_TOOL,
  UPDATE_PROJECT_TOOL,
  UPDATE_WORK_ITEM_TOOL,
  GET_AGENT_DASHBOARD_TOOL,
  LIST_ALLOWED_FOLDERS_TOOL,
  READ_REPOSITORY_TOOL,
  CREATE_SUB_AGENT_TOOL,
  UPDATE_SUB_AGENT_TOOL,
  DELETE_SUB_AGENT_TOOL,
  LIST_AGENTS_TOOL,
  LIST_SKILLS_TOOL,
  GET_SKILL_TOOL,
  CREATE_SKILL_TOOL,
  ASSIGN_SKILL_TOOL,
  UNASSIGN_SKILL_TOOL,
  EXECUTE_WORK_ITEM_TOOL,
  RETRY_WORK_ITEM_TOOL,
  PLAY_PROJECT_TOOL,
  PAUSE_PROJECT_TOOL,
  STEP_PROJECT_TOOL,
  ASK_SUPERIOR_TOOL,
  REPORT_BLOCKER_TOOL,
  RESOLVE_BLOCKER_TOOL,
  ESCALATE_BLOCKER_TOOL,
  CONVERT_BLOCKER_TO_QUESTION_TOOL,
  DELEGATE_BLOCKER_TOOL,
  ANSWER_QUESTION_TOOL,
  ESCALATE_QUESTION_TOOL,
  RECALL_TOOL,
  REMEMBER_LOG_TOOL,
  REMEMBER_LEARNING_TOOL,
  GET_PROJECT_JOURNAL_TOOL,
  GET_WORK_ITEM_JOURNAL_TOOL,
  GET_REPORTING_STATUS_TOOL,
  PROPOSE_AUDIT_IMPROVEMENT_TOOL,
  PROPOSE_DELIVERABLE_FINDING_TOOL,
  SUBMIT_COMPLETION_REPORT_TOOL,
  GET_PROJECT_KNOWLEDGE_TOOL,
  PROPOSE_WIKI_PAGE_TOOL,
  GET_WIKI_TREE_TOOL,
  GET_WIKI_PAGE_TOOL,
  PROPOSE_WIKI_EDIT_TOOL,
  POST_WIKI_COMMENT_TOOL,
  LIST_WIKI_PENDING_TOOL,
  APPROVE_WIKI_EDIT_TOOL,
  REJECT_WIKI_EDIT_TOOL,
  GET_GLOBAL_SYSTEM_PROMPT_TOOL,
  UPDATE_GLOBAL_SYSTEM_PROMPT_TOOL,
  TRIAGE_INTENT_TOOL,
  REPORT_RISK_TOOL,
  UPDATE_RISK_TOOL,
  REQUEST_PEER_REVIEW_TOOL,
  SUBMIT_PEER_REVIEW_TOOL,
  ASSESS_CHANGE_REQUEST_TOOL,
  REQUEST_SCOPE_EXPANSION_TOOL,
  APPROVE_PLAN_TOOL,
  REVOKE_PLAN_APPROVAL_TOOL,
  GET_AGENT_CAPACITY_TOOL,
  REQUEST_HANDOFF_TOOL,
  ACCEPT_HANDOFF_TOOL,
  RESOLVE_HANDOFF_TOOL,
  POST_ACTION_REVIEW_TOOL,
  RETRY_POST_ACTION_PROJECTION_TOOL,
  GET_POST_ACTION_CLOSURE_TOOL,
];

let registeredToolNamesCache: ReadonlySet<string> | undefined;

/**
 * Every tool name the runtime registers, read **at dispatch** rather than at module evaluation.
 *
 * Read by `create_skill`, which must admit a new skill's declared tools against what actually exists:
 * nine seed fragments declare `code-agent`, a tool registered nowhere, and an authored skill that did
 * the same would grant a station an instruction it cannot carry out (BOARD F-031, F-022). Kept here
 * rather than in the tool's own module, which cannot import this one without a cycle — and read lazily
 * for the same reason, one direction round: `delegate_to_agent` imports the sub-agent session, which
 * imports this module, so this file is evaluated while its own tool table is still being built. Reading
 * it eagerly put `undefined` into the set and every dispatch below threw.
 */
function registeredToolNames(): ReadonlySet<string> {
  return (registeredToolNamesCache ??= new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name)));
}

/** Handlers mapping tool name to its executor */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  delegate_to_agent: (ctx, args, scope) =>
    executeDelegateToAgent(ctx, args as unknown as DelegateToAgentArgs, scope),
  play_project: (ctx, args) => executePlayProject(ctx, args as unknown as ProjectExecutionArgs),
  pause_project: (ctx, args) => executePauseProject(ctx, args as unknown as ProjectExecutionArgs),
  step_project: (ctx, args) => executeStepProject(ctx, args as unknown as ProjectExecutionArgs),
  triage_intent: (ctx, args, scope) => {
    const result = executeTriageIntent(args as unknown as TriageIntentArgs);
    // A refusal is a decision the factory made on the operator's behalf, so it is recorded rather than
    // spoken and forgotten. Without this the boundary lives only in a reply: the operator cannot see
    // what was declined, and the refusal cannot be audited or counted (BOARD F-007's shape).
    if (result.refusal && ctx.refusalStore) {
      const recorded = ctx.refusalStore.record({
        request: (args as unknown as TriageIntentArgs).intent,
        boundary: result.refusal.boundary,
        boundaryStatement: RefusalStore.boundaryStatement(result.refusal.boundary),
        refusedByAgentId: scope?.agentId,
        projectId: scope?.projectId,
        conversationId: scope?.conversationId,
        surface: "agent",
      });
      result.refusal.statement = recorded.boundaryStatement;
      result.message += ` Recorded as refusal ${recorded.id}.`;
    }
    return result;
  },
  report_risk: (ctx, args) => executeReportRisk(ctx, args as unknown as ReportRiskArgs),
  update_risk: (ctx, args) => executeUpdateRisk(ctx, args as unknown as UpdateRiskArgs),
  request_peer_review: (ctx, args) => executeRequestPeerReview(ctx, args as unknown as RequestPeerReviewArgs),
  submit_peer_review: (ctx, args) => executeSubmitPeerReview(ctx, args as unknown as SubmitPeerReviewArgs),
  assess_change_request: (_ctx, args) => executeAssessChangeRequest(args as unknown as AssessChangeRequestArgs),
  request_scope_expansion: (ctx, args, scope) =>
    executeRequestScopeExpansion(ctx, args as unknown as RequestScopeExpansionArgs, scope),
  approve_plan: (ctx, args) => executeApprovePlan(ctx, args as unknown as ApprovePlanArgs),
  revoke_plan_approval: (ctx, args) => executeRevokePlanApproval(ctx, args as unknown as RevokePlanApprovalArgs),
  get_agent_capacity: (ctx, args) => executeGetAgentCapacity(ctx, args as unknown as GetAgentCapacityArgs),
  request_handoff: (ctx, args) => executeRequestHandoff(ctx, args as unknown as RequestHandoffArgs),
  accept_handoff: (ctx, args) => executeAcceptHandoff(ctx, args as unknown as AcceptHandoffArgs),
  resolve_handoff: (ctx, args) => executeResolveHandoff(ctx, args as unknown as ResolveHandoffArgs),
  get_global_system_prompt: (ctx, _args, scope) => executeGetGlobalSystemPrompt(ctx, scope),
  update_global_system_prompt: (ctx, args, scope) => executeUpdateGlobalSystemPrompt(ctx, scope, args as unknown as { prompt: string }),
  recall: (ctx, args, scope) => {
    if (!scope) throw new Error("Agent scope is required for memory tools.");
    return executeRecall(ctx, scope, args as unknown as RecallArgs);
  },
  remember_log: (ctx, args, scope) => {
    if (!scope) throw new Error("Agent scope is required for memory tools.");
    return executeRemember(ctx, scope, "log", args as unknown as RememberArgs);
  },
  remember_learning: (ctx, args, scope) => {
    if (!scope) throw new Error("Agent scope is required for memory tools.");
    return executeRemember(ctx, scope, "learning", args as unknown as RememberArgs);
  },
  submit_intent: async (ctx, args, scope) => {
    if (scope) {
      const actor = ctx.agentStore.getAgentBySlugOrId(scope.agentId);
      const actorSkills = actor ? ctx.skillStore.listAgentSkills(actor.id) : [];
      if (actor?.slug === "kampaku") {
        // The root agent reaching for this tool is trying to create work that has no container yet.
        // That is a real attempt, not a mistake to refuse flatly: it means the project does not
        // exist. The refusal must name the tool that does the job, because this guard is reached
        // before any project-scoped tool can explain itself. Measured: with only a system-prompt
        // instruction to call create_project, the root agent called submit_intent first and then
        // told the emperor the project was "typically created by submit_intent with
        // create_missing_agents: true" — a path this guard makes impossible.
        throw new Error(
          "Kampaku orchestrates and delegates; it cannot submit project plans directly. " +
            "This refusal means the project does not exist yet: call create_project to create the " +
            "container (and link its repository and lead), then delegate the plan to that lead.",
        );
      }
      // The authority is computed once, because **two** gates read it and they must agree.
      const named = typeof args.project_slug === "string" ? args.project_slug : undefined;
      const led = actor ? ledProjectFor(ctx.store, actor.id, named) : undefined;
      if (!actorSkills.includes("system-delegation") && !actorSkills.includes("workflow-specialist-delegation")) {
        // ...unless it is the **linked lead of the project it is planning**. A container's accountable lead
        // is the role the front office is told to delegate planning to, so a lead that cannot submit a plan
        // makes that instruction unreachable — measured 2026-09-25, where the lead asked the emperor to
        // authorize it to act as itself (BOARD F-046). Same reading ADR-0006 established for seats.
        //
        // The refusal keeps naming what would widen it, because an agent that stops at "not authorized"
        // asks the emperor a question only the product can answer.
        if (!led) {
          throw new Error(
            "This agent is not authorized to create project plans or subtasks. A project's linked lead may "
              + "plan that project; otherwise the agent needs the system-delegation skill. Name the project "
              + "you lead with project_slug.",
          );
        }
      }
      // **A project's linked lead may staff its own plan.** ADR-0006 decided that "a project lead may create
      // the seats it proposes", and that decision was applied to `create_sub_agent` — the check below is the
      // same authority one layer in, and it was left demanding `system-agent-roster`, which a lead's default
      // skill set does not contain (`system-plan-quality` tells it to plan; nothing told it to recruit).
      //
      // Measured 2026-09-28 taking suite 07 (run 14, tracing every dispatch): the lead proposed a plan whose
      // leaves needed specialist seats, called `submit_intent` with `create_missing_agents: true`, and was
      // refused — *"Only an agent with system-agent-roster may create missing agents during planning"* — a
      // sentence naming a skill it cannot hold. It retried with a rewritten intent three times in twelve
      // minutes (each rewrite a different fingerprint, which is why run 13 shows three previews and no apply),
      // and the turn ended with nothing persisted. The shape is the one this file keeps recording: an
      // instruction has nothing behind it.
      //
      // Both paths stay bounded the same way the seat path is: the actor must lead the project it is planning,
      // which is checked immediately above and named by `project_slug`.
      if (args.create_missing_agents === true && !actorSkills.includes("system-agent-roster") && !led) {
        throw new Error(
          "Only an agent with system-agent-roster may create missing agents during a plan it does not own. "
            + "A project's linked lead may create the seats its own plan needs (ADR-0006): name that project "
            + "with project_slug.",
        );
      }
    }
    // The turn's clock, into the planner. Planning is several model calls inside this one tool call, so the
    // session loop's own check cannot bound it — measured 2026-09-25, suite 06: 1 063 s of a 300 s budget.
    // See turn-budget.ts.
    return executeSubmitIntent(
      ctx,
      args as unknown as SubmitIntentArgs,
      turnDeadlineFromScope(scope?.deadlineAt, ctx.config.turnBudgetMs),
    );
  },
  get_project: (ctx, args) => executeGetProject(ctx, args as unknown as GetProjectArgs),
  list_projects: (ctx, args) => executeListProjects(ctx, args as unknown as ListProjectsArgs),
  get_job_ledger: (ctx, args) => executeGetJobLedger(ctx, args as unknown as GetJobLedgerArgs),
  create_project: (ctx, args, scope) =>
    executeCreateProject(ctx, args as unknown as CreateProjectArgs, scope),
  /**
   * A container's own fields belong to its **linked lead**, and to nobody else in the agent path.
   *
   * `sub-agent-session` grants the tool to whichever seat leads a project (`toolsForAgent`); this is the
   * same rule at dispatch, because a grant that is only advertised is not a grant. The front office still
   * never holds it — `eval-orchestrator-contract.test.ts` asserts that absence, and ADR-0005 keeps it — so
   * a reply that needs a metadata change delegates the one operation it is not allowed to perform.
   */
  update_project: (ctx, args, scope) => {
    if (scope) {
      const actor = ctx.agentStore.getAgentBySlugOrId(scope.agentId);
      if (!actor) throw new Error("Authorizing agent was not found.");
      const named = (args as { project_slug_or_id?: string }).project_slug_or_id;
      // Two authorities, and the second one predates this check: an agent holding a delegation skill has
      // always been able to reach this tool through its skill grant, so narrowing to the lead alone would be
      // a different change in the same week. The container's own lead is the half that was missing.
      const actorSkills = ctx.skillStore.listAgentSkills(actor.id);
      const delegated =
        actorSkills.includes("system-delegation") ||
        actorSkills.includes("workflow-specialist-delegation");
      if (!delegated && !(named && ledProjectFor(ctx.store, actor.id, named))) {
        throw new Error(
          `Editing a project's fields belongs to its linked lead; agent \"${actor.slug}\" does not lead ` +
            `\"${named ?? ""}\". The container's own lead may change it, and the operator's CLI ` +
            "(kampaku projects update) reaches the same field.",
        );
      }
    }
    return executeUpdateProject(ctx, args as unknown as UpdateProjectArgs);
  },
  update_work_item: (ctx, args, scope) => executeUpdateWorkItem(ctx, args as unknown as UpdateWorkItemArgs, scope),
  get_agent_dashboard: (ctx, args) => executeGetAgentDashboard(ctx, args as unknown as GetAgentDashboardArgs),
  list_allowed_folders: (ctx, args, scope) =>
    executeListAllowedFolders(ctx, args as unknown as { agent_slug?: string }, scope),
  read_repository: (ctx, args, scope) =>
    executeReadRepository(ctx, args as unknown as ReadRepositoryArgs, scope),
  create_sub_agent: (ctx, args, scope) => {
    if (scope) {
      const actor = ctx.agentStore.getAgentBySlugOrId(scope.agentId);
      const actorSkills = actor ? ctx.skillStore.listAgentSkills(actor.id) : [];
      if (actor?.slug === "kampaku") {
        return executeCreateSubAgent(ctx.agentStore, ctx.skillStore, args as unknown as CreateSubAgentArgs);
      }
      if (!actor) {
        throw new Error("Authorizing agent was not found.");
      }
      // Authorized either by a delegation skill, or by leading a project.
      //
      // The second path exists because roadmap 08's own authority flow — "the lead creates or requests
      // agents and sub-agents" — did not work: a lead's skill set is `system-delegation`,
      // `system-plan-quality`, `docs-writer`, `workflow-blockers`, so it held neither authorizing skill
      // while the specialists it was meant to create held `workflow-specialist-delegation` and could.
      // The authority was inverted (BOARD F-021, ADR-0006).
      //
      // The condition reads `projectLeadAgentId`, the same field `isAgentProjectOwner` uses for
      // work-item scope, rather than adding a skill to the slug-suffix map that roadmap 07 is deleting.
      // The parent-scope check below still bounds both paths to the actor's own subtree.
      const leadsAProject = ctx.store
        .listProjects()
        .some((project) => project.projectLeadAgentId === actor.id);
      if (
        !actorSkills.includes("system-agent-roster") &&
        !actorSkills.includes("workflow-specialist-delegation") &&
        !leadsAProject
      ) {
        throw new Error(
          "This agent is not authorized to create sub-agents. It needs a delegation skill, or it must " +
            "be the linked lead of a project.",
        );
      }
      const requestedParent = typeof args.parent_slug === "string" && args.parent_slug.trim()
        ? args.parent_slug.trim()
        : "kampaku";
      assertSubAgentParentScope(ctx.agentStore, actor.id, requestedParent);
    }
    return executeCreateSubAgent(ctx.agentStore, ctx.skillStore, args as unknown as CreateSubAgentArgs);
  },
  update_sub_agent: (ctx, args) => executeUpdateSubAgent(ctx.agentStore, args as unknown as UpdateSubAgentArgs),
  delete_sub_agent: (ctx, args) => executeDeleteSubAgent(ctx.agentStore, args as unknown as DeleteSubAgentArgs),
  list_agents: (ctx) => executeListAgents(ctx.agentStore, ctx.skillStore),
  list_skills: (ctx, args) =>
    executeListSkills(ctx.skillStore, args as unknown as ListSkillsArgs),
  /**
   * Authoring a capability for one project (BOARD F-022).
   *
   * The authority is checked inside the handler, at dispatch, and not only where the tool is advertised:
   * a lead holds `create_skill` because it leads *a* project, so the grant cannot be the statement that
   * it may author for *this* one. See `create-skill.ts` for which three authorities those are.
   */
  create_skill: (ctx, args, scope) =>
    executeCreateSkill(
      ctx,
      args as unknown as CreateSkillArgs,
      scope,
      registeredToolNames(),
    ),
  assign_skill: (ctx, args) => executeAssignSkill(ctx.agentStore, ctx.skillStore, args as unknown as Parameters<typeof executeAssignSkill>[2]),
  unassign_skill: (ctx, args) => executeUnassignSkill(ctx.agentStore, ctx.skillStore, args as unknown as Parameters<typeof executeUnassignSkill>[2]),
  execute_work_item: (ctx, args) => executeExecuteWorkItem(ctx, args as unknown as ExecuteWorkItemArgs),
  retry_work_item: (ctx, args) => executeRetryWorkItem(ctx, args as unknown as RetryWorkItemArgs),
  ask_superior: (ctx, args) => executeAskSuperior(ctx, args as unknown as AskSuperiorArgs),
  report_blocker: (ctx, args) => executeReportBlocker(ctx, args as unknown as ReportBlockerArgs),
  resolve_blocker: (ctx, args) => executeResolveBlocker(ctx, args as unknown as ResolveBlockerArgs),
  escalate_blocker: (ctx, args) => executeEscalateBlocker(ctx, args as unknown as EscalateBlockerArgs),
  convert_blocker_to_question: (ctx, args) => executeConvertBlockerToQuestion(ctx, args as unknown as ConvertBlockerToQuestionArgs),
  delegate_blocker: (ctx, args) => executeDelegateBlocker(ctx, args as unknown as DelegateBlockerArgs),
  answer_question: (ctx, args) => executeAnswerQuestion(ctx, args as unknown as AnswerQuestionArgs),
  escalate_question: (ctx, args) => executeEscalateQuestion(ctx, args as unknown as EscalateQuestionArgs),
  submit_completion_report: (ctx, args) => executeSubmitCompletionReport(ctx, args as unknown as SubmitCompletionReportArgs),
  get_project_journal: (ctx, args) => executeGetProjectJournal(ctx, args as unknown as GetProjectJournalArgs),
  get_work_item_journal: (ctx, args) => executeGetWorkItemJournal(ctx, args as unknown as GetWorkItemJournalArgs),
  get_reporting_status: (ctx, args) => executeGetReportingStatus(ctx, args as unknown as GetReportingStatusArgs),
  propose_audit_improvement: (ctx, args) => executeProposeAuditImprovement(ctx, args as unknown as ProposeAuditImprovementArgs),
  propose_deliverable_finding: (ctx, args) => executeProposeDeliverableFinding(ctx, args as unknown as ProposeDeliverableFindingArgs),
  get_project_knowledge: (ctx, args) =>
    executeGetProjectKnowledge(ctx, args as unknown as GetProjectKnowledgeArgs),
  propose_wiki_page: (ctx, args, scope) =>
    executeProposeWikiPage(ctx, args as unknown as ProposeWikiPageArgs, scope),
  get_wiki_tree: (ctx, args) => executeGetWikiTree(ctx, args as unknown as GetWikiTreeArgs),
  get_wiki_page: (ctx, args) => executeGetWikiPage(ctx, args as unknown as GetWikiPageArgs),
  propose_wiki_edit: (ctx, args) => executeProposeWikiEdit(ctx, args as unknown as ProposeWikiEditArgs),
  post_wiki_comment: (ctx, args) => executePostWikiComment(ctx, args as unknown as PostWikiCommentArgs),
  list_wiki_pending: (ctx, args) => executeListWikiPending(ctx, args as unknown as ListWikiPendingArgs),
  approve_wiki_edit: (ctx, args) => executeApproveWikiEdit(ctx, args as unknown as ApproveWikiEditArgs),
  reject_wiki_edit: (ctx, args) => executeRejectWikiEdit(ctx, args as unknown as RejectWikiEditArgs),
  post_action_review: (ctx, args) => executePostActionReview(ctx, args as unknown as PostActionResultArgs),
  retry_post_action_projection: (ctx, args) =>
    executeRetryPostActionProjection(ctx, args as unknown as RetryPostActionArgs),
  get_post_action_closure: (ctx, args) =>
    executeGetPostActionClosure(ctx, args as unknown as PostActionClosureArgs),
};

/**
 * A tool the caller does not hold was attempted. The boundary is this error, not a reply.
 *
 * Measured 2026-09-24, attempting the denied operation through the agent path — which is the method
 * suite 04's oracle prescribes, *"checked by attempting the operation through the tool path, not only by
 * reading the reply"*:
 *
 * | Denied tool | What happened |
 * |---|---|
 * | `update_project` (line-only; the front-office contract test asserts it can never hold it) | **executed** — it rewrote the project's repositories and **created and seeded** a directory at the named path |
 * | `delete_sub_agent` (not in the front-office allowlist) | **executed** — the project lead was deleted |
 *
 * Both were reachable by *naming the tool in a tool call*, because the allowlist was used to **advertise**
 * tools to the model and never consulted when the call came back. An advertised grant is not a grant: the
 * [security model](../../../../../docs/security/security-model.md) says *"Runtime authorization is enforced
 * in code … prompt text is never a grant"*, and the tool list is prompt text. This is the tool path's own
 * copy of BOARD F-042 — the same defect one layer in, on the surface that had refused these operations
 * "for months" only because no model had tried.
 */
export class ToolNotGrantedError extends Error {
  constructor(
    readonly toolName: string,
    readonly grantLabel: string,
  ) {
    super(
      `Tool "${toolName}" is not in ${grantLabel}, so it was not executed. ` +
        "A toolset is a grant, and a grant that is only advertised is not a grant: this refusal is made in " +
        "runtime code, before the handler runs. Use a tool you hold, or report that the operation belongs to " +
        "another surface and name it.",
    );
    this.name = "ToolNotGrantedError";
  }
}

export async function executeToolCall(
  ctx: KampakuToolContext,
  toolName: string,
  argsJson: string,
  scope?: ToolRuntimeScope,
  /**
   * The tools this caller actually holds, and the label that names them in the refusal.
   *
   * Passed at dispatch rather than derived here, because the grant belongs to the session that assembled
   * it: the front office's is `KAMPAKU_BUILTIN_DEFINITION.tools`, a sub-agent's is the tool set its skills
   * grant. Omitted means "caller already established authority" — only true for internal calls that pass
   * neither a model's choice nor a caller's arguments.
   */
  grant?: { allowed: ReadonlySet<string>; label: string },
): Promise<ToolExecutionResult> {
  const args = JSON.parse(argsJson) as Record<string, unknown>;
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  if (grant && !grant.allowed.has(toolName)) {
    throw new ToolNotGrantedError(toolName, grant.label);
  }
  // Timed here rather than inside each handler, because the turn's accounting wants one answer for "how long
  // did the tools take" and a handler that forgets its own clock would report zero (BOARD F-060).
  const startedAt = Date.now();
  try {
    const output = await handler(ctx, args, scope);
    traceToolCall(toolName, args, { ok: true, output });
    return { toolName, output, usage: readReportedUsage(output) ?? { elapsedMs: Date.now() - startedAt } };
  } catch (error) {
    traceToolCall(toolName, args, { ok: false, error });
    throw error;
  }
}

/**
 * Reads the usage a handler reports about itself, keeping this process's own measurement when it reports none.
 *
 * A tool that starts a session knows two facts the dispatcher cannot see — that session's model calls and its
 * wall clock — and a tool that starts none still took time here. Both are needed, so the reported nested cost
 * is merged over the local measurement rather than replacing it: `delegate_to_agent` reports the delegation's
 * model calls *and* its elapsed time, and a call that reported only one of them would leave the other a zero
 * the reader would take for "nothing happened".
 */
function readReportedUsage(
  output: unknown,
): { modelCalls?: number; elapsedMs?: number } | undefined {
  if (!output || typeof output !== "object") return undefined;
  const reported = (output as { usage?: unknown }).usage;
  if (!reported || typeof reported !== "object") return undefined;
  const raw = reported as { modelCalls?: unknown; elapsedMs?: unknown };
  const usage: { modelCalls?: number; elapsedMs?: number } = {};
  if (typeof raw.modelCalls === "number") usage.modelCalls = raw.modelCalls;
  if (typeof raw.elapsedMs === "number") usage.elapsedMs = raw.elapsedMs;
  return Object.keys(usage).length > 0 ? usage : undefined;
}

/**
 * Optional per-call trace of tool dispatch, written as JSON Lines to the path in `KAMPAKU_TRACE_TOOLS`.
 *
 * Off unless that variable names a path, and deliberately dumb: one line per call with the tool, the
 * arguments it was given, and what came back. It exists because a session that loops — or whose call is
 * refused — is otherwise **invisible until the turn ends**: the messages are held in memory and persisted in
 * one write at the end, so a loop that never ends never persists anything to read.
 *
 * Measured 2026-09-28 taking suite 07 (run 13): a delegated session previewed and approved **three different
 * plans in twelve minutes**, applied none of them, and there was no way to see the arguments it passed to
 * `submit_intent` or the error it received — an hour of waiting with nothing to look at. The turn's own reply
 * named the symptom and not the cause.
 */
function traceToolCall(
  toolName: string,
  args: Record<string, unknown>,
  outcome: { ok: boolean; output?: unknown; error?: unknown },
): void {
  const path = process.env.KAMPAKU_TRACE_TOOLS;
  if (!path) return;
  const clip = (value: unknown): string => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text !== undefined && text.length > 1200 ? `${text.slice(0, 1200)}…` : String(text);
  };
  const detail = outcome.ok
    ? clip(outcome.output)
    : clip(outcome.error instanceof Error ? outcome.error.message : outcome.error);
  try {
    appendFileSync(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), tool: toolName, args: clip(args), ok: outcome.ok, detail })}\n`,
    );
  } catch {
    // A trace that breaks the call it traces is worse than no trace.
  }
}

export type { AgentRecord, ToolExecutionResult };

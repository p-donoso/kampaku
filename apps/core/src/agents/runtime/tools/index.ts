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
  executeUpdateProject,
  UPDATE_PROJECT_TOOL,
  type UpdateProjectArgs,
} from "./update-project.js";
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
import { LIST_SKILLS_TOOL, executeListSkills } from "./list-skills.js";
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
  executeGetWikiPage,
  executeGetWikiTree,
  executeListWikiPending,
  executePostWikiComment,
  executeProposeWikiEdit,
  executeRejectWikiEdit,
  GET_WIKI_PAGE_TOOL,
  GET_WIKI_TREE_TOOL,
  LIST_WIKI_PENDING_TOOL,
  POST_WIKI_COMMENT_TOOL,
  PROPOSE_WIKI_EDIT_TOOL,
  REJECT_WIKI_EDIT_TOOL,
  type ApproveWikiEditArgs,
  type GetWikiPageArgs,
  type GetWikiTreeArgs,
  type ListWikiPendingArgs,
  type PostWikiCommentArgs,
  type ProposeWikiEditArgs,
  type RejectWikiEditArgs,
} from "./wiki-tools.js";
import {
  executeGetGlobalSystemPrompt,
  executeUpdateGlobalSystemPrompt,
  GET_GLOBAL_SYSTEM_PROMPT_TOOL,
  UPDATE_GLOBAL_SYSTEM_PROMPT_TOOL,
} from "./global-system-prompt.js";
import { assertSubAgentParentScope } from "./authorization.js";
import { executeTriageIntent, TRIAGE_INTENT_TOOL, type TriageIntentArgs } from "./triage-intent.js";
import { executeReportRisk, executeUpdateRisk, REPORT_RISK_TOOL, UPDATE_RISK_TOOL, type ReportRiskArgs, type UpdateRiskArgs } from "./risks.js";
import { executeRequestPeerReview, executeSubmitPeerReview, REQUEST_PEER_REVIEW_TOOL, SUBMIT_PEER_REVIEW_TOOL, type RequestPeerReviewArgs, type SubmitPeerReviewArgs } from "./peer-review.js";
import { executeAssessChangeRequest, ASSESS_CHANGE_REQUEST_TOOL, type AssessChangeRequestArgs } from "./change-control.js";
import { executeApprovePlan, executeRevokePlanApproval, APPROVE_PLAN_TOOL, REVOKE_PLAN_APPROVAL_TOOL, type ApprovePlanArgs, type RevokePlanApprovalArgs } from "./plan-approval.js";
import { executeGetAgentCapacity, GET_AGENT_CAPACITY_TOOL, type GetAgentCapacityArgs } from "./agent-capacity.js";
import { executeAcceptHandoff, executeRequestHandoff, executeResolveHandoff, ACCEPT_HANDOFF_TOOL, REQUEST_HANDOFF_TOOL, RESOLVE_HANDOFF_TOOL, type AcceptHandoffArgs, type RequestHandoffArgs, type ResolveHandoffArgs } from "./handoff.js";
import { DELEGATE_TO_AGENT_TOOL, executeDelegateToAgent, type DelegateToAgentArgs } from "./delegate-to-agent.js";
import { executePauseProject, executePlayProject, executeStepProject, PAUSE_PROJECT_TOOL, PLAY_PROJECT_TOOL, STEP_PROJECT_TOOL, type ProjectExecutionArgs } from "./project-execution.js";

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
}

export interface ToolRuntimeScope {
  agentId: string;
  conversationId?: string;
  projectId?: string;
}

export const KAMPAKU_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  SUBMIT_INTENT_TOOL,
  DELEGATE_TO_AGENT_TOOL,
  GET_PROJECT_TOOL,
  UPDATE_PROJECT_TOOL,
  UPDATE_WORK_ITEM_TOOL,
  GET_AGENT_DASHBOARD_TOOL,
  LIST_ALLOWED_FOLDERS_TOOL,
  CREATE_SUB_AGENT_TOOL,
  UPDATE_SUB_AGENT_TOOL,
  DELETE_SUB_AGENT_TOOL,
  LIST_AGENTS_TOOL,
  LIST_SKILLS_TOOL,
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
  APPROVE_PLAN_TOOL,
  REVOKE_PLAN_APPROVAL_TOOL,
  GET_AGENT_CAPACITY_TOOL,
  REQUEST_HANDOFF_TOOL,
  ACCEPT_HANDOFF_TOOL,
  RESOLVE_HANDOFF_TOOL,
];

/** Handlers mapping tool name to its executor */
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  delegate_to_agent: (ctx, args) => executeDelegateToAgent(ctx, args as unknown as DelegateToAgentArgs),
  play_project: (ctx, args) => executePlayProject(ctx, args as unknown as ProjectExecutionArgs),
  pause_project: (ctx, args) => executePauseProject(ctx, args as unknown as ProjectExecutionArgs),
  step_project: (ctx, args) => executeStepProject(ctx, args as unknown as ProjectExecutionArgs),
  triage_intent: (_ctx, args) => executeTriageIntent(args as unknown as TriageIntentArgs),
  report_risk: (ctx, args) => executeReportRisk(ctx, args as unknown as ReportRiskArgs),
  update_risk: (ctx, args) => executeUpdateRisk(ctx, args as unknown as UpdateRiskArgs),
  request_peer_review: (ctx, args) => executeRequestPeerReview(ctx, args as unknown as RequestPeerReviewArgs),
  submit_peer_review: (ctx, args) => executeSubmitPeerReview(ctx, args as unknown as SubmitPeerReviewArgs),
  assess_change_request: (_ctx, args) => executeAssessChangeRequest(args as unknown as AssessChangeRequestArgs),
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
        throw new Error("Kampaku is advisory and cannot submit project plans directly.");
      }
      if (!actorSkills.includes("system-delegation") && !actorSkills.includes("workflow-specialist-delegation")) {
        throw new Error("This agent is not authorized to create project plans or subtasks.");
      }
      if (args.create_missing_agents === true && !actorSkills.includes("system-agent-roster")) {
        throw new Error("Only an agent with system-agent-roster may create missing agents during planning.");
      }
    }
    return executeSubmitIntent(ctx, args as unknown as SubmitIntentArgs);
  },
  get_project: (ctx, args) => executeGetProject(ctx, args as unknown as GetProjectArgs),
  update_project: (ctx, args) => executeUpdateProject(ctx, args as unknown as UpdateProjectArgs),
  update_work_item: (ctx, args, scope) => executeUpdateWorkItem(ctx, args as unknown as UpdateWorkItemArgs, scope),
  get_agent_dashboard: (ctx, args) => executeGetAgentDashboard(ctx, args as unknown as GetAgentDashboardArgs),
  list_allowed_folders: (ctx) => executeListAllowedFolders(ctx),
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
      if (!actorSkills.includes("system-agent-roster") && !actorSkills.includes("workflow-specialist-delegation")) {
        throw new Error("This agent is not authorized to create sub-agents.");
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
  list_agents: (ctx) => executeListAgents(ctx.agentStore),
  list_skills: (ctx) => executeListSkills(ctx.skillStore),
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
  get_wiki_tree: (ctx, args) => executeGetWikiTree(ctx, args as unknown as GetWikiTreeArgs),
  get_wiki_page: (ctx, args) => executeGetWikiPage(ctx, args as unknown as GetWikiPageArgs),
  propose_wiki_edit: (ctx, args) => executeProposeWikiEdit(ctx, args as unknown as ProposeWikiEditArgs),
  post_wiki_comment: (ctx, args) => executePostWikiComment(ctx, args as unknown as PostWikiCommentArgs),
  list_wiki_pending: (ctx, args) => executeListWikiPending(ctx, args as unknown as ListWikiPendingArgs),
  approve_wiki_edit: (ctx, args) => executeApproveWikiEdit(ctx, args as unknown as ApproveWikiEditArgs),
  reject_wiki_edit: (ctx, args) => executeRejectWikiEdit(ctx, args as unknown as RejectWikiEditArgs),
};

export async function executeToolCall(
  ctx: KampakuToolContext,
  toolName: string,
  argsJson: string,
  scope?: ToolRuntimeScope,
): Promise<ToolExecutionResult> {
  const args = JSON.parse(argsJson) as Record<string, unknown>;
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  const output = await handler(ctx, args, scope);
  return { toolName, output };
}

export type { AgentRecord, ToolExecutionResult };

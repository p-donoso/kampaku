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
import type { PlanAndDelegateContext } from "../../../application/pm/submit-intent.js";
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
import { executeListProjects, LIST_PROJECTS_TOOL } from "./list-projects.js";
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
import { executeListFiles, executeReadFile, LIST_FILES_TOOL, READ_FILE_TOOL } from "./filesystem-inspection.js";

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
  LIST_PROJECTS_TOOL,
  GET_PROJECT_TOOL,
  UPDATE_PROJECT_TOOL,
  UPDATE_WORK_ITEM_TOOL,
  GET_AGENT_DASHBOARD_TOOL,
  LIST_ALLOWED_FOLDERS_TOOL,
  LIST_FILES_TOOL,
  READ_FILE_TOOL,
  CREATE_SUB_AGENT_TOOL,
  UPDATE_SUB_AGENT_TOOL,
  DELETE_SUB_AGENT_TOOL,
  LIST_AGENTS_TOOL,
  LIST_SKILLS_TOOL,
  ASSIGN_SKILL_TOOL,
  UNASSIGN_SKILL_TOOL,
  GET_GLOBAL_SYSTEM_PROMPT_TOOL,
  UPDATE_GLOBAL_SYSTEM_PROMPT_TOOL,
  EXECUTE_WORK_ITEM_TOOL,
  RETRY_WORK_ITEM_TOOL,
  SUBMIT_COMPLETION_REPORT_TOOL,
  GET_PROJECT_JOURNAL_TOOL,
  GET_WORK_ITEM_JOURNAL_TOOL,
  GET_REPORTING_STATUS_TOOL,
  PROPOSE_AUDIT_IMPROVEMENT_TOOL,
  PROPOSE_DELIVERABLE_FINDING_TOOL,
  ASK_SUPERIOR_TOOL,
  REPORT_BLOCKER_TOOL,
  RESOLVE_BLOCKER_TOOL,
  ESCALATE_BLOCKER_TOOL,
  CONVERT_BLOCKER_TO_QUESTION_TOOL,
  DELEGATE_BLOCKER_TOOL,
  ANSWER_QUESTION_TOOL,
  ESCALATE_QUESTION_TOOL,
  GET_WIKI_TREE_TOOL,
  GET_WIKI_PAGE_TOOL,
  PROPOSE_WIKI_EDIT_TOOL,
  POST_WIKI_COMMENT_TOOL,
  LIST_WIKI_PENDING_TOOL,
  APPROVE_WIKI_EDIT_TOOL,
  REJECT_WIKI_EDIT_TOOL,
  RECALL_TOOL,
  REMEMBER_LOG_TOOL,
  REMEMBER_LEARNING_TOOL,
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

export interface ToolExecutionResult {
  toolName: string;
  output: unknown;
}

export async function executeToolCall(
  ctx: KampakuToolContext,
  toolName: string,
  argsJson: string,
  scope?: ToolRuntimeScope,
): Promise<ToolExecutionResult> {
  const args = JSON.parse(argsJson) as Record<string, unknown>;

  switch (toolName) {
    case "triage_intent":
      return { toolName, output: executeTriageIntent(args as unknown as TriageIntentArgs) };
    case "report_risk":
      return { toolName, output: executeReportRisk(ctx, args as unknown as ReportRiskArgs) };
    case "update_risk":
      return { toolName, output: executeUpdateRisk(ctx, args as unknown as UpdateRiskArgs) };
    case "request_peer_review":
      return { toolName, output: executeRequestPeerReview(ctx, args as unknown as RequestPeerReviewArgs) };
    case "submit_peer_review":
      return { toolName, output: executeSubmitPeerReview(ctx, args as unknown as SubmitPeerReviewArgs) };
    case "assess_change_request":
      return { toolName, output: executeAssessChangeRequest(args as unknown as AssessChangeRequestArgs) };
    case "approve_plan":
      if (!args.agent_slug && typeof args.agent === "string") args.agent_slug = args.agent;
      if (!args.project_slug && typeof args.project === "string") args.project_slug = args.project;
      if (!args.approval_reference && typeof args.approvalReference === "string") args.approval_reference = args.approvalReference;
      if (!args.plan_fingerprint && typeof args.planFingerprint === "string") args.plan_fingerprint = args.planFingerprint;
      if (!args.plan_content_hash && typeof args.planContentHash === "string") args.plan_content_hash = args.planContentHash;
      return { toolName, output: executeApprovePlan(ctx, args as unknown as ApprovePlanArgs) };
    case "revoke_plan_approval":
      return { toolName, output: executeRevokePlanApproval(ctx, args as unknown as RevokePlanApprovalArgs) };
    case "get_agent_capacity":
      return { toolName, output: executeGetAgentCapacity(ctx, args as unknown as GetAgentCapacityArgs) };
    case "request_handoff":
      if (!args.agent_slug && typeof args.from_agent_slug === "string") args.agent_slug = args.from_agent_slug;
      if (!args.work_item_id && typeof args.workItemId === "string") args.work_item_id = args.workItemId;
      if (!args.new_owner_agent_slug && typeof args.to_agent_slug === "string") args.new_owner_agent_slug = args.to_agent_slug;
      if (!args.new_owner_agent_slug && typeof args.target_agent_slug === "string") args.new_owner_agent_slug = args.target_agent_slug;
      if (!args.new_owner_agent_slug && typeof args.targetAgentSlug === "string") args.new_owner_agent_slug = args.targetAgentSlug;
      if (!args.new_owner_agent_slug && typeof args.to_agent === "string") args.new_owner_agent_slug = args.to_agent;
      if (!args.expires_at && typeof args.expiry === "string") args.expires_at = args.expiry;
      return { toolName, output: executeRequestHandoff(ctx, args as unknown as RequestHandoffArgs) };
    case "accept_handoff":
      return { toolName, output: executeAcceptHandoff(ctx, args as unknown as AcceptHandoffArgs) };
    case "resolve_handoff":
      return { toolName, output: executeResolveHandoff(ctx, args as unknown as ResolveHandoffArgs) };
    case "get_global_system_prompt":
      return { toolName, output: executeGetGlobalSystemPrompt(ctx, scope) };
    case "update_global_system_prompt":
      return {
        toolName,
        output: executeUpdateGlobalSystemPrompt(ctx, scope, args as unknown as { prompt: string }),
      };
    case "recall":
      if (!scope) throw new Error("Agent scope is required for memory tools.");
      return { toolName, output: executeRecall(ctx, scope, args as RecallArgs) };
    case "remember_log":
      if (!scope) throw new Error("Agent scope is required for memory tools.");
      return { toolName, output: executeRemember(ctx, scope, "log", args as unknown as RememberArgs) };
    case "remember_learning":
      if (!scope) throw new Error("Agent scope is required for memory tools.");
      return { toolName, output: executeRemember(ctx, scope, "learning", args as unknown as RememberArgs) };
    case "submit_intent":
      if (typeof args.create_missing_agents === "string") {
        args.create_missing_agents = args.create_missing_agents.toLowerCase() === "true";
      }
      if (scope) {
        const actor = ctx.agentStore.getAgentBySlugOrId(scope.agentId);
        const actorSkills = actor ? ctx.skillStore.listAgentSkills(actor.id) : [];
        const temporaryRosterApproval = actor?.slug === "kampaku" && Boolean(scope.conversationId) &&
          ctx.questionStore?.list("answered").some((question) =>
            question.context?.includes(`conversation_id: ${scope.conversationId}`) &&
            /system-agent-roster|temporary permission|grant.*skill/i.test(question.question) &&
            /yes|grant|temporary permission/i.test(question.answer ?? ""),
          );
        const bootstrapPreview = actor?.slug === "kampaku" && args.mode !== "apply";
        // Kampaku may prepare a non-persistent preview during external-project
        // bootstrap. Applying a plan still requires the project lead approval
        // enforced by executeSubmitIntent.
        if (actor?.slug === "kampaku" && args.mode === "apply") {
          throw new Error("Kampaku cannot apply project plans directly; the project lead must approve the preview.");
        }
        if (!bootstrapPreview && !actorSkills.includes("system-delegation") && !actorSkills.includes("workflow-specialist-delegation")) {
          throw new Error("This agent is not authorized to create project plans or subtasks.");
        }
        if (args.create_missing_agents === true && !actorSkills.includes("system-agent-roster") && !temporaryRosterApproval) {
          throw new Error("Only an agent with system-agent-roster may create missing agents during planning.");
        }
      }
      return {
        toolName,
        output: await executeSubmitIntent(ctx, args as unknown as SubmitIntentArgs),
      };
    case "get_project":
      return {
        toolName,
        output: executeGetProject(ctx, args as unknown as GetProjectArgs),
      };
    case "list_files":
      return { toolName, output: executeListFiles(ctx, args as { path: string; recursive?: boolean; limit?: number }) };
    case "read_file":
      return { toolName, output: executeReadFile(ctx, args as { path: string; max_bytes?: number }) };
    case "update_project":
      return {
        toolName,
        output: executeUpdateProject(ctx, args as unknown as UpdateProjectArgs),
      };
    case "update_work_item":
      return {
        toolName,
        output: executeUpdateWorkItem(ctx, args as unknown as UpdateWorkItemArgs, scope),
      };
    case "get_agent_dashboard":
      return {
        toolName,
        output: executeGetAgentDashboard(ctx, args as unknown as GetAgentDashboardArgs),
      };
    case "list_allowed_folders":
      return {
        toolName,
        output: executeListAllowedFolders(ctx),
      };
    case "create_sub_agent":
      if (!args.slug && typeof args.agent_slug === "string") {
        args.slug = args.agent_slug;
      }
      if (scope) {
        const actor = ctx.agentStore.getAgentBySlugOrId(scope.agentId);
        const actorSkills = actor ? ctx.skillStore.listAgentSkills(actor.id) : [];
        const bootstrapLead = actor?.slug === "kampaku" && String(args.slug ?? "").trim().toLowerCase().endsWith("-lead");
        if (actor?.slug === "kampaku" && !bootstrapLead) {
          throw new Error("Kampaku may create only a project lead during external-project bootstrap.");
        }
        if (!actor) {
          throw new Error("Authorizing agent was not found.");
        }
        if (!bootstrapLead && !actorSkills.includes("system-agent-roster") && !actorSkills.includes("workflow-specialist-delegation")) {
          throw new Error("This agent is not authorized to create sub-agents.");
        }
        const requestedParent = typeof args.parent_slug === "string" && args.parent_slug.trim()
          ? args.parent_slug.trim()
          : "kampaku";
        assertSubAgentParentScope(ctx.agentStore, actor.id, requestedParent);
      }
      return {
        toolName,
        output: executeCreateSubAgent(ctx.agentStore, ctx.skillStore, args as unknown as CreateSubAgentArgs),
      };
    case "update_sub_agent":
      return {
        toolName,
        output: executeUpdateSubAgent(ctx.agentStore, args as unknown as UpdateSubAgentArgs),
      };
    case "delete_sub_agent":
      return {
        toolName,
        output: executeDeleteSubAgent(ctx.agentStore, args as unknown as DeleteSubAgentArgs),
      };
    case "list_projects":
      return {
        toolName,
        output: executeListProjects(ctx),
      };
    case "list_agents":
      return {
        toolName,
        output: executeListAgents(ctx.agentStore),
      };
    case "list_skills":
      return {
        toolName,
        output: executeListSkills(ctx.skillStore),
      };
    case "assign_skill":
      if (!args.skill_slug && typeof args.skill === "string") {
        args.skill_slug = args.skill;
      }
      return {
        toolName,
        output: executeAssignSkill(
          ctx.agentStore,
          ctx.skillStore,
          args as unknown as Parameters<typeof executeAssignSkill>[2],
        ),
      };
    case "unassign_skill":
      return {
        toolName,
        output: executeUnassignSkill(
          ctx.agentStore,
          ctx.skillStore,
          args as unknown as Parameters<typeof executeUnassignSkill>[2],
        ),
      };
    case "execute_work_item":
      return {
        toolName,
        output: await executeExecuteWorkItem(ctx, args as unknown as ExecuteWorkItemArgs),
      };
    case "retry_work_item":
      return {
        toolName,
        output: await executeRetryWorkItem(ctx, args as unknown as RetryWorkItemArgs),
      };
    case "ask_superior":
      return {
        toolName,
        output: executeAskSuperior(ctx, args as unknown as AskSuperiorArgs),
      };
    case "report_blocker":
      return {
        toolName,
        output: executeReportBlocker(ctx, args as unknown as ReportBlockerArgs),
      };
    case "resolve_blocker":
      return {
        toolName,
        output: executeResolveBlocker(ctx, args as unknown as ResolveBlockerArgs),
      };
    case "escalate_blocker":
      return {
        toolName,
        output: executeEscalateBlocker(ctx, args as unknown as EscalateBlockerArgs),
      };
    case "convert_blocker_to_question":
      return {
        toolName,
        output: executeConvertBlockerToQuestion(ctx, args as unknown as ConvertBlockerToQuestionArgs),
      };
    case "delegate_blocker":
      return {
        toolName,
        output: executeDelegateBlocker(ctx, args as unknown as DelegateBlockerArgs),
      };
    case "answer_question":
      return {
        toolName,
        output: executeAnswerQuestion(ctx, args as unknown as AnswerQuestionArgs),
      };
    case "escalate_question":
      return {
        toolName,
        output: executeEscalateQuestion(ctx, args as unknown as EscalateQuestionArgs),
      };
    case "submit_completion_report":
      return {
        toolName,
        output: executeSubmitCompletionReport(ctx, args as unknown as SubmitCompletionReportArgs),
      };
    case "get_project_journal":
      return {
        toolName,
        output: executeGetProjectJournal(ctx, args as unknown as GetProjectJournalArgs),
      };
    case "get_work_item_journal":
      return {
        toolName,
        output: executeGetWorkItemJournal(ctx, args as unknown as GetWorkItemJournalArgs),
      };
    case "get_reporting_status":
      return { toolName, output: executeGetReportingStatus(ctx, args as unknown as GetReportingStatusArgs) };
    case "propose_audit_improvement":
      return {
        toolName,
        output: executeProposeAuditImprovement(ctx, args as unknown as ProposeAuditImprovementArgs),
      };
    case "propose_deliverable_finding":
      return {
        toolName,
        output: executeProposeDeliverableFinding(ctx, args as unknown as ProposeDeliverableFindingArgs),
      };
    case "get_wiki_tree":
      return {
        toolName,
        output: executeGetWikiTree(ctx, args as unknown as GetWikiTreeArgs),
      };
    case "get_wiki_page":
      return {
        toolName,
        output: executeGetWikiPage(ctx, args as unknown as GetWikiPageArgs),
      };
    case "propose_wiki_edit":
      return {
        toolName,
        output: executeProposeWikiEdit(ctx, args as unknown as ProposeWikiEditArgs),
      };
    case "post_wiki_comment":
      return {
        toolName,
        output: executePostWikiComment(ctx, args as unknown as PostWikiCommentArgs),
      };
    case "list_wiki_pending":
      return {
        toolName,
        output: executeListWikiPending(ctx, args as unknown as ListWikiPendingArgs),
      };
    case "approve_wiki_edit":
      return {
        toolName,
        output: executeApproveWikiEdit(ctx, args as unknown as ApproveWikiEditArgs),
      };
    case "reject_wiki_edit":
      return {
        toolName,
        output: executeRejectWikiEdit(ctx, args as unknown as RejectWikiEditArgs),
      };
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export type { AgentRecord };

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
  executeProposeAuditImprovement,
  executeSubmitCompletionReport,
  GET_PROJECT_JOURNAL_TOOL,
  GET_WORK_ITEM_JOURNAL_TOOL,
  PROPOSE_AUDIT_IMPROVEMENT_TOOL,
  SUBMIT_COMPLETION_REPORT_TOOL,
  type GetProjectJournalArgs,
  type GetWorkItemJournalArgs,
  type ProposeAuditImprovementArgs,
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
  GET_PROJECT_TOOL,
  GET_AGENT_DASHBOARD_TOOL,
  LIST_ALLOWED_FOLDERS_TOOL,
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
      return {
        toolName,
        output: await executeSubmitIntent(ctx, args as unknown as SubmitIntentArgs),
      };
    case "get_project":
      return {
        toolName,
        output: executeGetProject(ctx, args as unknown as GetProjectArgs),
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
    case "propose_audit_improvement":
      return {
        toolName,
        output: executeProposeAuditImprovement(ctx, args as unknown as ProposeAuditImprovementArgs),
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

import type { RepositoryRole } from "../config.js";
import type { GoalAudit } from "../application/goals.js";
import type { GoalRecord, ProjectRecord } from "../persistence/store.js";
import type { AgentChatResponse, AgentRecord, AgentTreeNode } from "../agents/types.js";
import type { ProjectOverview } from "../persistence/pm-store.js";
import type { AgentDashboard } from "../application/pm/dashboard.js";
import type { PlanAndDelegateResult } from "../delegator/plan-and-delegate.js";
import type { FilesystemSettings } from "../application/settings/filesystem.js";
import { BaseHttpClient, CoreClientError, type BaseClientOptions } from "./base-client.js";

export { CoreClientError };
export type { GoalAudit };

export interface CreateGoalRequest {
  projectId: string;
  objective: string;
  priority?: number;
  repositoryRole?: RepositoryRole;
  status?: string;
  createdAt?: string;
}

export interface HealthResponse {
  status: "ok";
}

export interface GoalsListResponse {
  goals: GoalRecord[];
}

export interface WaitForGoalOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AgentBlockage {
  id: string;
  description: string;
  context?: string;
  status: "pending" | "resolved";
  reportedByAgentId: string;
  recipientAgentId: string;
  reportedByAgentSlug?: string;
  recipientAgentSlug?: string;
  escalationPathSlugs?: string[];
  workItemId?: string;
  resolution?: string;
  resolutionKind?: "resolved" | "delegated" | "converted_to_question" | "escalated";
  createdAt: string;
}

export interface AgentQuestion {
  id: string;
  question: string;
  context?: string;
  status: "pending" | "answered";
  askedByAgentId: string;
  recipientAgentId: string;
  askedByAgentSlug?: string;
  recipientAgentSlug?: string;
  escalationPathSlugs?: string[];
  workItemId?: string;
  answer?: string;
  createdAt: string;
}

const TERMINAL_RESULT_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);

export interface JobStatusResponse {
  id: string;
  taskId: string;
  status: string;
  leaseId?: string | null;
  error?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface WaitForJobOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export type CoreClientOptions = BaseClientOptions;

/**
 * A destructive request that has been recorded and is waiting for the operator's confirmation.
 *
 * Returned by a gated call whose first request had no token. The call had **no effect**: it states the
 * consequence and hands back the reference and token a second request must present. The token is bound to
 * the exact action, target and payload, and is single-use.
 */
export interface DestructiveActionChallenge {
  status: "confirmation_required";
  action: string;
  target: string;
  consequence: string;
  reference: string;
  confirmationToken: string;
}

/** What a caller presents to actually perform a destructive action it was challenged for. */
export interface DestructiveActionConfirmation {
  reference: string;
  confirmationToken: string;
  confirmedBy?: string;
}

/** True when a gated call returned a challenge instead of acting. */
export function isDestructiveChallenge(value: unknown): value is DestructiveActionChallenge {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "confirmation_required"
  );
}

/** The confirmation fields a gated route reads, as a request body. */
function destructiveConfirmationBody(
  confirmation: DestructiveActionConfirmation,
): Record<string, unknown> {
  return {
    confirmation_reference: confirmation.reference,
    confirmation_token: confirmation.confirmationToken,
    confirmed_by: confirmation.confirmedBy ?? "operator",
  };
}

export interface GlobalSystemPromptSettings {
  prompt: string;
}

export interface SystemResetResult {
  mode: "bootstrap" | "all";
  deletedAgents: string[];
  createdAgents: string[];
  inheritedLearnings: number;
}

export class CoreClient extends BaseHttpClient {
  constructor(options: CoreClientOptions) {
    super(options);
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.request("/api/v1/health");
      return res.ok;
    } catch {
      return false;
    }
  }

  async getDefaultProject(): Promise<ProjectRecord | undefined> {
    return this.getOptional<ProjectRecord>("/api/v1/projects/default", "Failed to fetch default project");
  }

  async createGoal(input: CreateGoalRequest): Promise<GoalRecord> {
    return this.post<GoalRecord>(
      "/api/v1/goals",
      {
        projectId: input.projectId,
        objective: input.objective,
        priority: input.priority,
        repositoryRole: input.repositoryRole,
        status: input.status ?? "active",
        createdAt: input.createdAt ?? new Date().toISOString(),
      },
      "Failed to create goal",
    );
  }

  async listGoals(options: { limit?: number } = {}): Promise<GoalRecord[]> {
    const limit = options.limit ?? 50;
    const body = await this.get<GoalsListResponse>(`/api/v1/goals?limit=${limit}`, "Failed to list goals");
    return body.goals;
  }

  async getGoalAudit(goalId: string): Promise<GoalAudit> {
    return this.get<GoalAudit>(`/api/v1/goals/${encodeURIComponent(goalId)}`, "Failed to fetch goal");
  }

  async waitForGoal(goalId: string, options: WaitForGoalOptions = {}): Promise<GoalAudit> {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const pollIntervalMs = options.pollIntervalMs ?? 1500;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const audit = await this.getGoalAudit(goalId);
      const hasTerminal = audit.results.some((result) => TERMINAL_RESULT_STATUSES.has(result.status));
      if (hasTerminal) return audit;
      await sleep(pollIntervalMs);
    }

    throw new Error("Timed out waiting for job completion");
  }

  async getJob(jobId: string): Promise<JobStatusResponse | undefined> {
    return this.getOptional<JobStatusResponse>(`/api/v1/jobs/${encodeURIComponent(jobId)}`, "Failed to fetch job");
  }

  async waitForJob(jobId: string, options: WaitForJobOptions = {}): Promise<JobStatusResponse> {
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const pollIntervalMs = options.pollIntervalMs ?? 2000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }
      if (TERMINAL_JOB_STATUSES.has(job.status)) {
        return job;
      }
      await sleep(pollIntervalMs);
    }

    throw new Error(`Timed out waiting for job ${jobId}`);
  }

  async waitForHealth(timeoutMs = 30_000, pollIntervalMs = 500): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.health()) return;
      await sleep(pollIntervalMs);
    }
    throw new Error(`Core did not become healthy at ${this.baseUrl}`);
  }

  async chatWithKampaku(
    message: string,
    options: { conversationId?: string; projectId?: string } = {},
  ): Promise<AgentChatResponse> {
    const body = await this.post<{
      reply: string;
      conversation_id: string;
      toolsUsed?: string[];
      agentUsed?: "llm" | "stub";
      model?: string;
      contextTruncation?: AgentChatResponse["contextTruncation"];
    }>(
      "/api/v1/agents/kampaku/chat",
      {
        message,
        conversation_id: options.conversationId,
        project_id: options.projectId,
      },
      "Failed to chat with Kampaku",
    );

    return {
      reply: body.reply,
      conversationId: body.conversation_id,
      toolsUsed: body.toolsUsed,
      agentUsed: body.agentUsed,
      model: body.model,
      contextTruncation: body.contextTruncation,
    };
  }

  async listAgents(options: { tree?: boolean } = {}): Promise<{
    agents?: AgentRecord[];
    tree?: AgentTreeNode[];
  }> {
    const query = options.tree ? "?tree=true" : "";
    return this.get<{ agents?: AgentRecord[]; tree?: AgentTreeNode[] }>(
      `/api/v1/agents${query}`,
      "Failed to list agents",
    );
  }

  async getAgent(slugOrId: string): Promise<AgentRecord> {
    return this.get<AgentRecord>(`/api/v1/agents/${encodeURIComponent(slugOrId)}`, "Failed to fetch agent");
  }

  /**
   * Deletes an agent, through the gate the security model requires.
   *
   * Without a `confirmation` this performs the **first** request only: it returns the challenge the server
   * recorded, and the agent still exists. With a `confirmation` it presents the token the challenge
   * carried, and the deletion happens. The CLI's `-y` is what decides which of the two it passes — a
   * confirmation that never leaves the client, as `-y` used to be, is not the gate the security model
   * describes.
   */
  async deleteAgent(
    slugOrId: string,
    confirmation?: DestructiveActionConfirmation,
  ): Promise<DestructiveActionChallenge | void> {
    const path = `/api/v1/agents/${encodeURIComponent(slugOrId)}`;
    if (confirmation) {
      await this.delete(path, destructiveConfirmationBody(confirmation), "Failed to delete agent");
      return;
    }
    return this.delete<DestructiveActionChallenge>(path, undefined, "Failed to delete agent");
  }

  async updateAgent(
    slugOrId: string,
    input: {
      name?: string;
      responsibilities?: string;
      system_prompt?: string;
      parent_slug?: string;
    },
  ): Promise<AgentRecord> {
    return this.patch<AgentRecord>(`/api/v1/agents/${encodeURIComponent(slugOrId)}`, input, "Failed to update agent");
  }

  async submitIntent(input: {
    intent: string;
    projectSlug?: string;
    createMissingAgents?: boolean;
    granularity?: "standard" | "fine";
    mode?: "preview" | "apply";
    approvalReference?: string;
    approvalFingerprint?: string;
    approvalContentHash?: string;
  }): Promise<PlanAndDelegateResult> {
    return this.post<PlanAndDelegateResult>("/api/v1/intents", input, "Failed to submit intent");
  }

  async approvePlan(input: {
    agent_slug: string;
    project_slug: string;
    approval_reference: string;
    plan_fingerprint: string;
    plan_content_hash: string;
    expires_at?: string;
  }): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>("/api/v1/plans/approve", input, "Failed to approve plan");
  }

  async revokePlanApproval(input: {
    agent_slug: string;
    project_slug: string;
    approval_reference: string;
    plan_fingerprint: string;
    plan_content_hash: string;
  }): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>("/api/v1/plans/revoke", input, "Failed to revoke plan approval");
  }

  async getReportingStatus(
    workItemId: string,
    agentSlug?: string,
    projectId?: string,
    requireWikiSync = false,
  ): Promise<Record<string, unknown>> {
    const query = new URLSearchParams();
    if (agentSlug) query.set("agent_slug", agentSlug);
    if (projectId) query.set("project_id", projectId);
    if (requireWikiSync) query.set("require_wiki_sync", "true");
    return this.get<Record<string, unknown>>(
      `/api/v1/work-items/${encodeURIComponent(workItemId)}/reporting-status?${query}`,
      "Failed to fetch reporting status",
    );
  }

  async listProjects(): Promise<{ projects: ProjectRecord[] }> {
    return this.get<{ projects: ProjectRecord[] }>("/api/v1/projects", "Failed to list projects");
  }

  async createProject(input: {
    name: string;
    slug?: string;
    description?: string;
    repositories?: ProjectRecord["repositories"];
    /** The accountable owner, by slug — so a non-chat surface can open an *owned* work order (F-036). */
    project_lead_slug?: string;
  }): Promise<ProjectRecord> {
    return this.post<ProjectRecord>("/api/v1/projects", input, "Failed to create project");
  }

  /**
   * Deletes a project, through the same gate as `deleteAgent`.
   *
   * Added at the same time: before it, project deletion was reachable only by a raw REST call — and
   * ungated, which is how the suite-04 run deleted `s4-demo` with a single unauthenticated `DELETE`.
   */
  async deleteProject(
    idOrSlug: string,
    confirmation?: DestructiveActionConfirmation,
  ): Promise<DestructiveActionChallenge | void> {
    const path = `/api/v1/projects/${encodeURIComponent(idOrSlug)}`;
    if (confirmation) {
      await this.delete(path, destructiveConfirmationBody(confirmation), "Failed to delete project");
      return;
    }
    return this.delete<DestructiveActionChallenge>(path, undefined, "Failed to delete project");
  }

  async getProjectOverview(idOrSlug: string): Promise<ProjectOverview> {
    return this.get<ProjectOverview>(
      `/api/v1/projects/${encodeURIComponent(idOrSlug)}`,
      "Failed to fetch project",
    );
  }

  async updateProject(
    idOrSlug: string,
    input: {
      repositories?: ProjectRecord["repositories"];
      /** Deliberate opt-in to link a repository inside the Kampaku workspace. */
      allow_workspace_repository?: boolean;
      /** Deliberate opt-in to link a `file://` path that does not exist yet, so it is created and seeded. */
      allow_missing_path?: boolean;
      name?: string;
      description?: string;
      status?: ProjectRecord["status"];
      project_lead_slug?: string | null;
      coherence_strategy?: string | null;
      wikiSyncRequired?: boolean;
      wikiSyncPageSlug?: string;
      wikiSyncPhasePages?: Record<string, string>;
      /** Present when confirming a governance change a prior call was challenged for. */
      confirmation_reference?: string;
      confirmation_token?: string;
      confirmed_by?: string;
    },
  ): Promise<ProjectRecord | DestructiveActionChallenge> {
    return this.patch<ProjectRecord | DestructiveActionChallenge>(
      `/api/v1/projects/${encodeURIComponent(idOrSlug)}`,
      input,
      "Failed to update project",
    );
  }

  async getWikiTree(projectSlug: string): Promise<{
    projectId: string;
    projectSlug: string;
    tree: Array<{ page: { title: string; slug: string; status: string }; children: unknown[] }>;
    pendingCount: number;
  }> {
    return this.get(
      `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki`,
      "Failed to fetch wiki tree",
    );
  }

  async getWikiPage(
    projectSlug: string,
    pageSlug: string,
  ): Promise<{
    page: { title: string; slug: string; contentMd: string; status: string };
    pendingEdit?: { contentMd: string; proposedBySlug?: string };
    comments: Array<{
      comment: { authorSlug?: string; authorName?: string; content: string };
      children: unknown[];
    }>;
  }> {
    return this.get(
      `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}`,
      "Failed to fetch wiki page",
    );
  }

  async getAgentDashboard(
    slugOrId: string,
    options: { includeSubordinates?: boolean } = {},
  ): Promise<AgentDashboard> {
    const include = options.includeSubordinates !== false;
    return this.get<AgentDashboard>(
      `/api/v1/agents/${encodeURIComponent(slugOrId)}/dashboard?include_subordinates=${include}`,
      "Failed to fetch agent dashboard",
    );
  }

  async listQuestions(status: "pending" | "answered" = "pending"): Promise<AgentQuestion[]> {
    const body = await this.get<{ questions: AgentQuestion[] }>(
      `/api/v1/questions?status=${status}`,
      "Failed to fetch questions",
    );
    return body.questions;
  }

  async answerQuestion(id: string, answer: string): Promise<AgentQuestion> {
    return this.post<AgentQuestion>(
      `/api/v1/questions/${encodeURIComponent(id)}/answer`,
      { answer },
      "Failed to answer question",
    );
  }

  async listRefusals(boundary?: string): Promise<{
    refusals: Array<{
      id: string;
      request: string;
      boundary: string;
      boundaryStatement: string;
      refusedByAgentSlug?: string;
      surface: string;
      createdAt: string;
    }>;
    total: number;
  }> {
    const query = boundary ? `?boundary=${encodeURIComponent(boundary)}` : "";
    return this.get(`/api/v1/refusals${query}`, "Failed to fetch refusals");
  }

  async getRefusal(id: string): Promise<{ refusal: Record<string, unknown> }> {
    return this.get(
      `/api/v1/refusals/${encodeURIComponent(id)}`,
      "Failed to fetch refusal",
    );
  }

  async listBlockers(status: "pending" | "resolved" = "pending"): Promise<AgentBlockage[]> {
    const body = await this.get<{ blockers: AgentBlockage[] }>(
      `/api/v1/blockers?status=${status}`,
      "Failed to fetch blockers",
    );
    return body.blockers;
  }

  async resolveBlocker(id: string, resolution: string): Promise<AgentBlockage> {
    return this.post<AgentBlockage>(
      `/api/v1/blockers/${encodeURIComponent(id)}/resolve`,
      { resolution },
      "Failed to resolve blocker",
    );
  }

  async getFilesystemSettings(): Promise<FilesystemSettings> {
    return this.get<FilesystemSettings>("/api/v1/settings/filesystem", "Failed to fetch filesystem settings");
  }

  async getGlobalSystemPromptSettings(): Promise<GlobalSystemPromptSettings> {
    return this.get<GlobalSystemPromptSettings>(
      "/api/v1/settings/global-system-prompt",
      "Failed to fetch global system prompt",
    );
  }

  async updateGlobalSystemPrompt(prompt: string): Promise<GlobalSystemPromptSettings> {
    return this.put<GlobalSystemPromptSettings>(
      "/api/v1/settings/global-system-prompt",
      { prompt },
      "Failed to update global system prompt",
    );
  }

  async resetBootstrap(keepLearnings = false): Promise<SystemResetResult> {
    return this.post<SystemResetResult>(
      "/api/v1/settings/reset-bootstrap",
      { keepLearnings },
      "Failed to reset bootstrap",
    );
  }

  async resetAll(): Promise<SystemResetResult> {
    return this.post<SystemResetResult>("/api/v1/settings/reset-all", undefined, "Failed to reset all data");
  }

  async addAllowedFolder(input: {
    path: string;
    label?: string;
    readOnly?: boolean;
  }): Promise<FilesystemSettings> {
    return this.post<FilesystemSettings>(
      "/api/v1/settings/filesystem/folders",
      input,
      "Failed to add allowed folder",
    );
  }

  async removeAllowedFolder(folderIdOrPath: string): Promise<FilesystemSettings> {
    return this.delete<FilesystemSettings>(
      `/api/v1/settings/filesystem/folders/${encodeURIComponent(folderIdOrPath)}`,
      undefined,
      "Failed to remove allowed folder",
    );
  }

  async updateAllowedFolder(
    folderId: string,
    input: { label?: string; readOnly?: boolean },
  ): Promise<FilesystemSettings> {
    return this.patch<FilesystemSettings>(
      `/api/v1/settings/filesystem/folders/${encodeURIComponent(folderId)}`,
      input,
      "Failed to update allowed folder",
    );
  }

  async listConversations(options: { agentSlug?: string; limit?: number } = {}): Promise<{
    conversations: Array<{
      id: string;
      agentSlug: string;
      projectId: string | null;
      title: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const params = new URLSearchParams();
    if (options.agentSlug) params.set("agent_slug", options.agentSlug);
    if (options.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    return this.get<{
      conversations: Array<{
        id: string;
        agentSlug: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/v1/conversations${query ? `?${query}` : ""}`, "Failed to list conversations");
  }

  async getConversation(id: string): Promise<{
    conversation: {
      id: string;
      agentSlug: string;
      projectId: string | null;
      title: string | null;
      createdAt: string;
      updatedAt: string;
    };
    messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  }> {
    return this.get<{
      conversation: {
        id: string;
        agentSlug: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      };
      messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
    }>(`/api/v1/conversations/${encodeURIComponent(id)}`, "Failed to fetch conversation");
  }

  async listSkills(): Promise<{
    skills: Array<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs?: string[];
    }>;
  }> {
    return this.get<{
      skills: Array<{
        slug: string;
        name: string;
        description: string;
        capabilities: string[];
        tools: string[];
        promptFragment: string;
        assignedAgentSlugs?: string[];
      }>;
    }>("/api/v1/skills", "Failed to list skills");
  }

  async getSkill(slug: string): Promise<{
    slug: string;
    name: string;
    description: string;
    capabilities: string[];
    tools: string[];
    promptFragment: string;
    assignedAgentSlugs: string[];
  }> {
    return this.get<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>(`/api/v1/skills/${encodeURIComponent(slug)}`, "Failed to get skill");
  }

  async createSkill(input: {
    slug: string;
    name: string;
    description: string;
    capabilities?: string[];
    tools?: string[];
    prompt_fragment: string;
  }): Promise<{
    slug: string;
    name: string;
    description: string;
    capabilities: string[];
    tools: string[];
    promptFragment: string;
    assignedAgentSlugs: string[];
  }> {
    return this.post<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>("/api/v1/skills", input, "Failed to create skill");
  }

  async updateSkill(
    slug: string,
    input: {
      slug?: string;
      name?: string;
      description?: string;
      capabilities?: string[];
      tools?: string[];
      prompt_fragment?: string;
    },
  ): Promise<{
    slug: string;
    name: string;
    description: string;
    capabilities: string[];
    tools: string[];
    promptFragment: string;
    assignedAgentSlugs: string[];
  }> {
    return this.patch<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>(`/api/v1/skills/${encodeURIComponent(slug)}`, input, "Failed to update skill");
  }

  async deleteSkill(slug: string): Promise<void> {
    await this.delete(`/api/v1/skills/${encodeURIComponent(slug)}`, undefined, "Failed to delete skill");
  }

  async updateWorkItem(
    id: string,
    input: {
      title?: string;
      description?: string;
      status?: string;
      priority?: number;
      assignee_agent_id?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.patch<Record<string, unknown>>(
      `/api/v1/work-items/${encodeURIComponent(id)}`,
      input,
      "Failed to update work item",
    );
  }

  async executeWorkItem(id: string): Promise<{
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  }> {
    return this.post<{
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    }>(`/api/v1/work-items/${encodeURIComponent(id)}/execute`, undefined, "Failed to execute work item");
  }

  async retryWorkItem(id: string): Promise<{
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  }> {
    return this.post<{
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    }>(`/api/v1/work-items/${encodeURIComponent(id)}/retry`, undefined, "Failed to retry work item");
  }

  async playProject(slugOrId: string): Promise<{
    autoExecute: true;
    gated?: boolean;
    gate?: {
      gated: boolean;
      reason?: string;
      detail?: string;
    };
    started?: {
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    };
    nextWorkItemId?: string | null;
  }> {
    return this.post<{
      autoExecute: true;
      gated?: boolean;
      gate?: {
        gated: boolean;
        reason?: string;
        detail?: string;
      };
      started?: {
        workItemId: string;
        goalId: string;
        jobId: string;
        objective: string;
        repositoryRole: string;
      };
      nextWorkItemId?: string | null;
    }>(`/api/v1/projects/${encodeURIComponent(slugOrId)}/play`, undefined, "Failed to play project");
  }

  async pauseProject(slugOrId: string): Promise<{ autoExecute: false }> {
    return this.post<{ autoExecute: false }>(
      `/api/v1/projects/${encodeURIComponent(slugOrId)}/pause`,
      undefined,
      "Failed to pause project",
    );
  }

  async stepProject(slugOrId: string): Promise<{
    autoExecute: false;
    gated?: boolean;
    gate?: {
      gated: boolean;
      reason?: string;
      detail?: string;
    };
    started?: {
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    };
    nextWorkItemId?: string | null;
    activeTrackId?: string | null;
    activeTrackTitle?: string | null;
  }> {
    return this.post<{
      autoExecute: false;
      gated?: boolean;
      gate?: {
        gated: boolean;
        reason?: string;
        detail?: string;
      };
      started?: {
        workItemId: string;
        goalId: string;
        jobId: string;
        objective: string;
        repositoryRole: string;
      };
      nextWorkItemId?: string | null;
      activeTrackId?: string | null;
      activeTrackTitle?: string | null;
    }>(`/api/v1/projects/${encodeURIComponent(slugOrId)}/step`, undefined, "Failed to step project");
  }

  async getProjectExecution(slugOrId: string): Promise<{
    autoExecute: boolean;
    gated: boolean;
    gate: { gated: boolean; reason?: string; detail?: string };
    nextStep?: {
      trackId: string | null;
      trackTitle: string | null;
      workItemId: string | null;
      workItemTitle: string | null;
      blockedReason: string | null;
    };
  }> {
    return this.get<{
      autoExecute: boolean;
      gated: boolean;
      gate: { gated: boolean; reason?: string; detail?: string };
      nextStep?: {
        trackId: string | null;
        trackTitle: string | null;
        workItemId: string | null;
        workItemTitle: string | null;
        blockedReason: string | null;
      };
    }>(`/api/v1/projects/${encodeURIComponent(slugOrId)}/execution`, "Failed to fetch project execution state");
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

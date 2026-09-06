import type { RepositoryRole } from "../config.js";
import type { GoalAudit } from "../application/goals.js";
import type { GoalRecord, ProjectRecord } from "../persistence/store.js";
import type { AgentChatResponse, AgentRecord, AgentTreeNode } from "../agents/types.js";
import type { ProjectOverview } from "../persistence/pm-store.js";
import type { AgentDashboard } from "../application/pm/dashboard.js";
import type { PlanAndDelegateResult } from "../delegator/plan-and-delegate.js";
import type {
  FilesystemSettings,
} from "../application/settings/filesystem.js";

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

export class CoreClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "CoreClientError";
  }
}

export interface CoreClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
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

export class CoreClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: CoreClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetch ?? fetch;
  }

  async health(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/v1/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getDefaultProject(): Promise<ProjectRecord | undefined> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/projects/default`);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch default project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<ProjectRecord>;
  }

  async createGoal(input: CreateGoalRequest): Promise<GoalRecord> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        objective: input.objective,
        priority: input.priority,
        repositoryRole: input.repositoryRole,
        status: input.status ?? "active",
        createdAt: input.createdAt ?? new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      throw new CoreClientError(
        `Failed to create goal: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<GoalRecord>;
  }

  async listGoals(options: { limit?: number } = {}): Promise<GoalRecord[]> {
    const limit = options.limit ?? 50;
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/goals?limit=${limit}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to list goals: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    const body = (await res.json()) as GoalsListResponse;
    return body.goals;
  }

  async getGoalAudit(goalId: string): Promise<GoalAudit> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/goals/${goalId}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch goal: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<GoalAudit>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch job: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<JobStatusResponse>;
  }

  async cancelJob(jobId: string): Promise<{ status: string; jobId?: string }> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to cancel job: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{ status: string; jobId?: string }>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/agents/kampaku/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
        project_id: options.projectId,
      }),
    });

    if (!res.ok) {
      throw new CoreClientError(
        `Failed to chat with Kampaku: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    const body = (await res.json()) as {
      reply: string;
      conversation_id: string;
      toolsUsed?: string[];
      agentUsed?: "llm" | "stub";
      model?: string;
    };

    return {
      reply: body.reply,
      conversationId: body.conversation_id,
      toolsUsed: body.toolsUsed,
      agentUsed: body.agentUsed,
      model: body.model,
    };
  }

  async listAgents(options: { tree?: boolean } = {}): Promise<{
    agents?: AgentRecord[];
    tree?: AgentTreeNode[];
  }> {
    const query = options.tree ? "?tree=true" : "";
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/agents${query}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to list agents: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<{ agents?: AgentRecord[]; tree?: AgentTreeNode[] }>;
  }

  async getAgent(slugOrId: string): Promise<AgentRecord> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(slugOrId)}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch agent: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<AgentRecord>;
  }

  async deleteAgent(slugOrId: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(slugOrId)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new CoreClientError(
        `Failed to delete agent: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/agents/${encodeURIComponent(slugOrId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      throw new CoreClientError(
        `Failed to update agent: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<AgentRecord>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      throw new CoreClientError(
        `Failed to submit intent: ${res.status}`,
        res.status,
        await res.text(),
      );
    }

    return res.json() as Promise<PlanAndDelegateResult>;
  }

  async approvePlan(input: { agent_slug: string; project_slug: string; approval_reference: string; plan_fingerprint: string; plan_content_hash: string; expires_at?: string }): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/plans/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) throw new CoreClientError(`Failed to approve plan: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<Record<string, unknown>>;
  }

  async revokePlanApproval(input: { agent_slug: string; project_slug: string; approval_reference: string; plan_fingerprint: string; plan_content_hash: string }): Promise<Record<string, unknown>> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/plans/revoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) throw new CoreClientError(`Failed to revoke plan approval: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<Record<string, unknown>>;
  }

  async getReportingStatus(workItemId: string, agentSlug?: string, projectId?: string, requireWikiSync = false): Promise<Record<string, unknown>> {
    const query = new URLSearchParams();
    if (agentSlug) query.set("agent_slug", agentSlug);
    if (projectId) query.set("project_id", projectId);
    if (requireWikiSync) query.set("require_wiki_sync", "true");
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/work-items/${encodeURIComponent(workItemId)}/reporting-status?${query}`);
    if (!res.ok) throw new CoreClientError(`Failed to fetch reporting status: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<Record<string, unknown>>;
  }

  async listProjects(): Promise<{ projects: ProjectRecord[] }> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/projects`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to list projects: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{ projects: ProjectRecord[] }>;
  }

  async getProjectOverview(idOrSlug: string): Promise<ProjectOverview> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(idOrSlug)}`,
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<ProjectOverview>;
  }

  async updateProject(
    idOrSlug: string,
    input: {
      name?: string;
      description?: string;
      status?: ProjectRecord["status"];
      project_lead_slug?: string | null;
      coherence_strategy?: string | null;
      wikiSyncRequired?: boolean;
      wikiSyncPageSlug?: string;
      wikiSyncPhasePages?: Record<string, string>;
    },
  ): Promise<ProjectRecord> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(idOrSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to update project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<ProjectRecord>;
  }

  async getWikiTree(projectSlug: string): Promise<{
    projectId: string;
    projectSlug: string;
    tree: Array<{ page: { title: string; slug: string; status: string }; children: unknown[] }>;
    pendingCount: number;
  }> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki`,
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch wiki tree: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json();
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
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}`,
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch wiki page: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json();
  }

  async getAgentDashboard(
    slugOrId: string,
    options: { includeSubordinates?: boolean } = {},
  ): Promise<AgentDashboard> {
    const include = options.includeSubordinates !== false;
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/agents/${encodeURIComponent(slugOrId)}/dashboard?include_subordinates=${include}`,
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch agent dashboard: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<AgentDashboard>;
  }

  async listQuestions(status: "pending" | "answered" = "pending"): Promise<AgentQuestion[]> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/questions?status=${status}`);
    if (!res.ok) throw new CoreClientError(`Failed to fetch questions: ${res.status}`, res.status, await res.text());
    return ((await res.json()) as { questions: AgentQuestion[] }).questions;
  }

  async answerQuestion(id: string, answer: string): Promise<AgentQuestion> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/questions/${encodeURIComponent(id)}/answer`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer }),
    });
    if (!res.ok) throw new CoreClientError(`Failed to answer question: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<AgentQuestion>;
  }

  async listBlockers(status: "pending" | "resolved" = "pending"): Promise<AgentBlockage[]> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/blockers?status=${status}`);
    if (!res.ok) throw new CoreClientError(`Failed to fetch blockers: ${res.status}`, res.status, await res.text());
    return ((await res.json()) as { blockers: AgentBlockage[] }).blockers;
  }

  async resolveBlocker(id: string, resolution: string): Promise<AgentBlockage> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/blockers/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    if (!res.ok) throw new CoreClientError(`Failed to resolve blocker: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<AgentBlockage>;
  }

  async getFilesystemSettings(): Promise<FilesystemSettings> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/filesystem`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch filesystem settings: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<FilesystemSettings>;
  }

  async getGlobalSystemPromptSettings(): Promise<GlobalSystemPromptSettings> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/global-system-prompt`);
    if (!res.ok) throw new CoreClientError(`Failed to fetch global system prompt: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<GlobalSystemPromptSettings>;
  }

  async updateGlobalSystemPrompt(prompt: string): Promise<GlobalSystemPromptSettings> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/global-system-prompt`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new CoreClientError(`Failed to update global system prompt: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<GlobalSystemPromptSettings>;
  }

  async resetBootstrap(keepLearnings = false): Promise<SystemResetResult> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/reset-bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keepLearnings }),
    });
    if (!res.ok) throw new CoreClientError(`Failed to reset bootstrap: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<SystemResetResult>;
  }

  async resetAll(): Promise<SystemResetResult> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/reset-all`, { method: "POST" });
    if (!res.ok) throw new CoreClientError(`Failed to reset all data: ${res.status}`, res.status, await res.text());
    return res.json() as Promise<SystemResetResult>;
  }

  async addAllowedFolder(input: {
    path: string;
    label?: string;
    readOnly?: boolean;
  }): Promise<FilesystemSettings> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/settings/filesystem/folders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to add allowed folder: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<FilesystemSettings>;
  }

  async removeAllowedFolder(folderIdOrPath: string): Promise<FilesystemSettings> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/settings/filesystem/folders/${encodeURIComponent(folderIdOrPath)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to remove allowed folder: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<FilesystemSettings>;
  }

  async updateAllowedFolder(
    folderId: string,
    input: { label?: string; readOnly?: boolean },
  ): Promise<FilesystemSettings> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/settings/filesystem/folders/${encodeURIComponent(folderId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to update allowed folder: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<FilesystemSettings>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/conversations${query ? `?${query}` : ""}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to list conversations: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      conversations: Array<{
        id: string;
        agentSlug: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch conversation: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      conversation: {
        id: string;
        agentSlug: string;
        projectId: string | null;
        title: string | null;
        createdAt: string;
        updatedAt: string;
      };
      messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
    }>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/skills`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to list skills: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      skills: Array<{
        slug: string;
        name: string;
        description: string;
        capabilities: string[];
        tools: string[];
        promptFragment: string;
        assignedAgentSlugs?: string[];
      }>;
    }>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to get skill: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>;
  }

  async createSkill(input: {
    slug: string;
    name: string;
    description?: string;
    capabilities?: string[];
    tools?: string[];
    prompt_fragment?: string;
  }): Promise<{
    slug: string;
    name: string;
    description: string;
    capabilities: string[];
    tools: string[];
    promptFragment: string;
    assignedAgentSlugs: string[];
  }> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/skills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to create skill: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>;
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to update skill: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      slug: string;
      name: string;
      description: string;
      capabilities: string[];
      tools: string[];
      promptFragment: string;
      assignedAgentSlugs: string[];
    }>;
  }

  async deleteSkill(slug: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/skills/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to delete skill: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
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
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/work-items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to update work item: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async executeWorkItem(id: string): Promise<{
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  }> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/work-items/${encodeURIComponent(id)}/execute`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to execute work item: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    }>;
  }

  async retryWorkItem(id: string): Promise<{
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  }> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/work-items/${encodeURIComponent(id)}/retry`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to retry work item: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
      workItemId: string;
      goalId: string;
      jobId: string;
      objective: string;
      repositoryRole: string;
    }>;
  }

  async deleteQuestion(id: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/api/v1/questions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new CoreClientError(`Failed to delete question: ${res.status}`, res.status, await res.text());
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
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(slugOrId)}/play`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to play project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
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
    }>;
  }

  async pauseProject(slugOrId: string): Promise<{ autoExecute: false }> {
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(slugOrId)}/pause`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to pause project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{ autoExecute: false }>;
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
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(slugOrId)}/step`,
      { method: "POST" },
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to step project: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
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
    }>;
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
    const res = await this.fetchFn(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(slugOrId)}/execution`,
    );
    if (!res.ok) {
      throw new CoreClientError(
        `Failed to fetch project execution state: ${res.status}`,
        res.status,
        await res.text(),
      );
    }
    return res.json() as Promise<{
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
    }>;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type {
  AgentDashboard,
  AgentRecord,
  AgentRosterNode,
  AgentTreeNode,
  FilesystemSettings,
  ModelProviderSettings,
  GoalAudit,
  ProjectOverview,
  ProjectRecord,
  ProjectRosterTreeNode,
  SkillRecord,
  RuntimeStatus,
  AgentQuestion,
  AgentBlockage,
  AgentMemory,
  WorkItemRecord,
  WorkItemJournalEntry,
  WorkItemDetail,
  WikiTreeResponse,
  WikiPageDetail,
  ConversationRecord,
  ChatMessage,
} from "./types";
import { toApiError } from "./api-errors";

function getBaseUrl(): string {
  // Browser: same-origin proxy via next.config rewrites (avoids localhost vs 127.0.0.1).
  if (typeof window !== "undefined") return "";
  // SSR: talk to core directly.
  return (
    process.env.KAMPAKU_CORE_URL ??
    process.env.NEXT_PUBLIC_KAMPAKU_API_URL ??
    "http://127.0.0.1:8080"
  ).replace(/\/$/, "");
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw toApiError(path, res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function listAgents(): Promise<{ tree: AgentTreeNode[] }> {
  return fetchJson("/api/v1/agents?tree=true");
}

export function getAgentsRoster(): Promise<{ tree: AgentRosterNode[] }> {
  return fetchJson("/api/v1/agents/roster");
}

export function getAgent(slug: string): Promise<AgentRecord> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}`);
}

export function getAgentDashboard(slug: string): Promise<AgentDashboard> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}/dashboard`);
}

export function getAgentMemories(slug: string): Promise<{
  memories: AgentMemory[];
  counts: { logs: number; learnings: number };
}> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}/memories?limit=100`);
}

export function listProjects(): Promise<{ projects: ProjectRecord[] }> {
  return fetchJson("/api/v1/projects");
}

export function getProjectsRoster(): Promise<{ projects: ProjectRosterTreeNode[] }> {
  return fetchJson("/api/v1/projects/roster");
}

export function getProjectOverview(slug: string): Promise<ProjectOverview> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}`);
}

export function approvePlan(input: { agent_slug: string; project_slug: string; approval_reference: string; plan_fingerprint: string; plan_content_hash: string; expires_at?: string }) {
  return fetchJson<Record<string, unknown>>("/api/v1/plans/approve", { method: "POST", body: JSON.stringify(input) });
}

export function revokePlanApproval(input: { agent_slug: string; project_slug: string; approval_reference: string; plan_fingerprint: string; plan_content_hash: string }) {
  return fetchJson<Record<string, unknown>>("/api/v1/plans/revoke", { method: "POST", body: JSON.stringify(input) });
}

export function getPlanPreview(approvalReference: string): Promise<{
  approvalReference: string;
  projectSlug: string;
  planFingerprint: string;
  planContentHash: string;
  plannerUsed: "llm" | "stub";
  plan: { project?: { name?: string; slug?: string; description?: string }; work_items: Array<{ title: string; description?: string; assignee_slug?: string; parent_ref?: string }> };
}> {
  return fetchJson(`/api/v1/plans/${encodeURIComponent(approvalReference)}`);
}

export function getReportingStatus(workItemId: string, params?: { agentSlug?: string; projectId?: string; requireWikiSync?: boolean }) {
  const query = new URLSearchParams();
  if (params?.agentSlug) query.set("agent_slug", params.agentSlug);
  if (params?.projectId) query.set("project_id", params.projectId);
  if (params?.requireWikiSync) query.set("require_wiki_sync", "true");
  return fetchJson<Record<string, unknown>>(`/api/v1/work-items/${encodeURIComponent(workItemId)}/reporting-status?${query}`);
}

export function listSkills(): Promise<{ skills: SkillRecord[] }> {
  return fetchJson("/api/v1/skills");
}

export function getSkill(slug: string): Promise<SkillRecord> {
  return fetchJson(`/api/v1/skills/${encodeURIComponent(slug)}`);
}

export function createSkill(input: {
  slug: string;
  name: string;
  description?: string;
  capabilities?: string[];
  tools?: string[];
  prompt_fragment?: string;
}): Promise<SkillRecord> {
  return fetchJson("/api/v1/skills", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSkill(
  slug: string,
  input: {
    slug?: string;
    name?: string;
    description?: string;
    capabilities?: string[];
    tools?: string[];
    prompt_fragment?: string;
  },
): Promise<SkillRecord> {
  return fetchJson(`/api/v1/skills/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSkill(slug: string): Promise<void> {
  const path = `/api/v1/skills/${encodeURIComponent(slug)}`;
  return fetch(`${getBaseUrl()}${path}`, { method: "DELETE" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text();
      throw toApiError(path, res.status, body, { entityType: "skill", action: "delete" });
    }
  });
}

export function listConversations(): Promise<{
  conversations: ConversationRecord[];
}> {
  return fetchJson("/api/v1/conversations?limit=30");
}

export function getConversation(id: string): Promise<{
  conversation: ConversationRecord;
  messages: ChatMessage[];
}> {
  return fetchJson(`/api/v1/conversations/${encodeURIComponent(id)}`);
}

export function getConversationStatus(id: string): Promise<{ running: boolean; phase?: string; tool?: string }> {
  return fetchJson(`/api/v1/conversations/${encodeURIComponent(id)}/status`);
}

export function updateConversation(id: string, title: string): Promise<{ conversation: ConversationRecord }> {
  return fetchJson(`/api/v1/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string): Promise<void> {
  return fetch(`${getBaseUrl()}/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text();
      throw toApiError(`/api/v1/conversations/${id}`, res.status, body);
    }
  });
}

export function chatWithKampaku(
  message: string,
  options: { conversationId?: string; projectId?: string } = {},
): Promise<{
  reply: string;
  conversation_id: string;
  toolsUsed?: string[];
  agentUsed?: "llm" | "stub";
  model?: string;
}> {
  return fetchJson("/api/v1/agents/kampaku/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: options.conversationId,
      project_id: options.projectId,
    }),
  });
}

export function createWorkItem(
  projectId: string,
  input: {
    title: string;
    description?: string;
    parent_id?: string | null;
    status?: string;
    priority?: number;
    sort_order?: number;
    assignee_agent_id?: string;
  },
): Promise<WorkItemRecord> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/work-items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getWorkItemDetail(id: string): Promise<WorkItemDetail> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}`);
}

export function updateWorkItem(
  id: string,
  input: {
    title?: string;
    description?: string;
    status?: string;
    priority?: number;
    sort_order?: number;
    parent_id?: string | null;
    assignee_agent_id?: string;
  },
): Promise<WorkItemRecord> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteWorkItem(id: string, cascade = false): Promise<void> {
  const query = cascade ? "?cascade=true" : "";
  return fetch(`${getBaseUrl()}/api/v1/work-items/${encodeURIComponent(id)}${query}`, {
    method: "DELETE",
  }).then((res) => {
    if (!res.ok) {
      return res.text().then((body) => {
        throw new Error(`${id}: ${res.status} ${body}`);
      });
    }
  });
}

export function executeWorkItem(id: string): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
}> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}/execute`, { method: "POST" });
}

export function retryWorkItem(id: string): Promise<{
  workItemId: string;
  goalId: string;
  jobId: string;
  objective: string;
  repositoryRole: string;
}> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export function playProject(slug: string): Promise<{
  autoExecute: true;
  started?: {
    workItemId: string;
    goalId: string;
    jobId: string;
    objective: string;
    repositoryRole: string;
  };
  nextWorkItemId?: string | null;
}> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/play`, { method: "POST" });
}

export function pauseProject(slug: string): Promise<{ autoExecute: false }> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/pause`, { method: "POST" });
}

export function getProjectExecution(slug: string): Promise<{
  autoExecute: boolean;
  gated: boolean;
  gate: { gated: boolean; reason?: string; detail?: string };
}> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}/execution`);
}

export function getGoalAudit(goalId: string): Promise<GoalAudit> {
  return fetchJson(`/api/v1/goals/${encodeURIComponent(goalId)}`);
}

export function pauseJobRun(jobId: string): Promise<{ id: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/pause`, { method: "POST" });
}

export function resumeJobRun(jobId: string): Promise<{ id: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/resume`, { method: "POST" });
}

export function cancelJobRun(jobId: string): Promise<{ jobId: string; status: string }> {
  return fetchJson(`/api/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export function getFilesystemSettings(): Promise<FilesystemSettings> {
  return fetchJson("/api/v1/settings/filesystem");
}

export function getGlobalSystemPromptSettings(): Promise<{ prompt: string }> {
  return fetchJson("/api/v1/settings/global-system-prompt");
}

export function getModelProviderSettings(): Promise<ModelProviderSettings> {
  return fetchJson("/api/v1/settings/model-provider");
}

export function updateModelProviderSettings(input: ModelProviderSettings & { apiKey?: string; clearApiKey?: boolean }): Promise<ModelProviderSettings> {
  return fetchJson("/api/v1/settings/model-provider", { method: "PUT", body: JSON.stringify(input) });
}

export function updateGlobalSystemPrompt(prompt: string): Promise<{ prompt: string }> {
  return fetchJson("/api/v1/settings/global-system-prompt", {
    method: "PUT",
    body: JSON.stringify({ prompt }),
  });
}

export interface SystemResetResult {
  mode: "bootstrap" | "all";
  deletedAgents: string[];
  createdAgents: string[];
  inheritedLearnings: number;
}

export function resetBootstrap(keepLearnings: boolean): Promise<SystemResetResult> {
  return fetchJson("/api/v1/settings/reset-bootstrap", {
    method: "POST",
    body: JSON.stringify({ keepLearnings }),
  });
}

export function resetAllData(): Promise<SystemResetResult> {
  return fetchJson("/api/v1/settings/reset-all", { method: "POST" });
}

export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return fetchJson("/api/v1/runtime/status");
}

export function submitIntent(input: {
  intent: string;
  projectSlug?: string;
  createMissingAgents?: boolean;
  granularity?: "standard" | "fine";
}): Promise<Record<string, unknown>> {
  return fetchJson("/api/v1/intents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listQuestions(status: "pending" | "answered" = "pending"): Promise<{ questions: AgentQuestion[] }> {
  return fetchJson(`/api/v1/questions?status=${status}`);
}

export function retryChat(conversationId: string, projectId?: string): Promise<{ accepted: boolean; conversation_id: string; phase: string }> {
  return fetchJson("/api/v1/agents/kampaku/chat/retry", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, project_id: projectId }),
  });
}

export function answerQuestion(id: string, answer: string): Promise<AgentQuestion> {
  return fetchJson(`/api/v1/questions/${encodeURIComponent(id)}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

export function listBlockers(status: "pending" | "resolved" = "pending"): Promise<{ blockers: AgentBlockage[] }> {
  return fetchJson(`/api/v1/blockers?status=${status}`);
}

export function resolveBlocker(id: string, resolution: string): Promise<AgentBlockage> {
  return fetchJson(`/api/v1/blockers/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution }),
  });
}

export function getProjectJournal(
  projectId: string,
  query = "",
): Promise<{ entries: WorkItemJournalEntry[] }> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectId)}/journal${query}`);
}

export function getWorkItemJournal(
  workItemId: string,
  query = "",
): Promise<{ entries: WorkItemJournalEntry[] }> {
  return fetchJson(`/api/v1/work-items/${encodeURIComponent(workItemId)}/journal${query}`);
}

export function updateAgent(
  slug: string,
  input: {
    name?: string;
    responsibilities?: string;
    system_prompt?: string;
    parent_slug?: string;
  },
): Promise<AgentRecord> {
  return fetchJson(`/api/v1/agents/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAgent(slug: string): Promise<void> {
  const path = `/api/v1/agents/${encodeURIComponent(slug)}`;
  return fetch(`${getBaseUrl()}${path}`, { method: "DELETE" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text();
      throw toApiError(path, res.status, body, { entityType: "agent", action: "delete" });
    }
  });
}

export function updateProject(
  slug: string,
  input: { name?: string; description?: string; status?: string },
): Promise<ProjectRecord> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProject(slug: string): Promise<void> {
  const path = `/api/v1/projects/${encodeURIComponent(slug)}`;
  return fetch(`${getBaseUrl()}${path}`, { method: "DELETE" }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text();
      throw toApiError(path, res.status, body, { entityType: "project", action: "delete" });
    }
  });
}

export function updateProjectDocument(
  id: string,
  input: { title?: string; content_md?: string },
): Promise<{ id: string; slug: string; title: string; contentMd: string }> {
  return fetchJson(`/api/v1/project-documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getWikiTree(projectSlug: string): Promise<WikiTreeResponse> {
  return fetchJson(`/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki`);
}

export function getWikiPage(projectSlug: string, pageSlug: string): Promise<WikiPageDetail> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}`,
  );
}

export function postWikiComment(
  projectSlug: string,
  pageSlug: string,
  input: { content: string; author_name?: string; agent_slug?: string; parent_comment_id?: string },
): Promise<{ id: string; content: string; createdAt: string }> {
  return fetchJson(
    `/api/v1/projects/${encodeURIComponent(projectSlug)}/wiki/pages/${encodeURIComponent(pageSlug)}/comments`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

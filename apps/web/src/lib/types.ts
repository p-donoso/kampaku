export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  source: "builtin" | "bootstrap" | "generated";
  responsibilities: string;
  systemPrompt: string;
  status: "active" | "archived";
  skills?: string[];
  createdAt: string;
}

export interface GlobalSystemPromptSettings {
  prompt: string;
}

export interface ModelProviderSettings {
  provider: string;
  protocol: "openai-v1";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
}

export interface AgentTreeNode {
  agent: AgentRecord;
  children: AgentTreeNode[];
}

export type AgentWorkload = "running" | "queued" | "idle" | "attention";

export type AgentLastActivitySource = "work_item" | "delegation" | "memory" | "conversation";

export interface AgentRosterEntry {
  id: string;
  slug: string;
  name: string;
  responsibilities: string;
  parentId: string | null;
  parentSlug: string | null;
  status: "active" | "archived";
  source: "builtin" | "bootstrap" | "generated";
  skills: string[];
  workload: AgentWorkload;
  activeTasks: number;
  failedTasks: number;
  pendingTasks: number;
  totalTasks: number;
  currentTask?: { title: string; projectSlug: string; phase: string };
  projectSlugs: string[];
  memoryCounts: { logs: number; learnings: number };
  lastActivityAt: string | null;
  lastActivitySource?: AgentLastActivitySource;
}

export interface AgentRosterRollup {
  activeTasks: number;
  failedTasks: number;
  totalTasks: number;
  learnings: number;
  hasActiveChild: boolean;
}

export interface AgentRosterNode {
  agent: AgentRosterEntry;
  children: AgentRosterNode[];
  rollup?: AgentRosterRollup;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  projectLeadAgentId?: string | null;
  coherenceStrategy?: string | null;
  planGranularity?: "standard" | "fine";
  wikiSyncRequired?: boolean;
  wikiSyncPageSlug?: string;
  wikiSyncPhasePages?: Record<string, string>;
  repositories: Array<{ url: string; role: string; defaultBranch?: string }>;
  createdAt: string;
  updatedAt: string;
}

export type PlanGranularity = "standard" | "fine";

export interface WorkItemComplexity {
  granularity: PlanGranularity;
  depth: number;
  role: "container" | "leaf";
  leafCount: number;
  targetLeaves: number;
  minLeaves: number;
  filesUsed: number;
  filesMax: number;
  scriptsUsed: number;
  scriptsMax: number;
  descriptionChars: number;
  minDescriptionChars: number;
}

export interface WorkItemRecord {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority: number;
  sortOrder?: number;
  assigneeAgentId?: string | null;
  assigneeSlug?: string;
  goalId?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  executionPhase?: "idle" | "queued" | "running" | "done" | "failed";
  executionLabel?: string;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  complexity?: WorkItemComplexity;
  routingReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemTreeNode {
  item: WorkItemRecord;
  children: WorkItemTreeNode[];
}

export interface WorkItemChildSummary {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
}

export interface WorkItemTaskOption {
  id: string;
  title: string;
  parentId: string | null;
}

export interface WorkItemDetail {
  item: WorkItemRecord & {
    routingReason?: string;
    acceptanceCriteria: string[];
    dependsOn: string[];
  };
  project: { id: string; slug: string; name: string; planGranularity?: PlanGranularity };
  parent?: { id: string; title: string };
  children: WorkItemChildSummary[];
  projectTasks: WorkItemTaskOption[];
}

export interface ProjectOverview {
  project: ProjectRecord;
  documents: Array<{ id: string; slug: string; title: string; contentMd: string }>;
  milestones: Array<{ id: string; title: string; description?: string | null; status: string }>;
  workItems: WorkItemTreeNode[];
}

export type ProjectHealth = "attention" | "active" | "idle";

export interface ProjectRosterEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  projectLeadSlug: string | null;
  health: ProjectHealth;
  activeTasks: number;
  failedTasks: number;
  pendingTasks: number;
  doneTasks: number;
  totalTasks: number;
  progressPct: number;
  pendingQuestions: number;
  pendingBlockers: number;
  currentTask?: { title: string; assigneeSlug: string | null; phase: string };
  autoExecute: boolean;
  executionGated: boolean;
  executionGateReason?: "pending_questions" | "pending_blockers" | "blocked_task";
  executionGateDetail?: string;
  /**
   * The closure refusal behind a `blocked_task` gate: the rule, the field it read, the item, and the command
   * that clears it. Without it the label could only be the item's title, and the layer above said "an error,
   * pending question, or blocker" — three causes, none of them this one (BOARD F-088).
   */
  executionGateBlocked?: {
    code: string;
    field: string;
    rule: string;
    workItemId: string;
    workItemTitle: string;
    clearWith: string;
  };
  lastActivityAt: string | null;
  updatedAt: string;
}

export interface ProjectRosterTaskNode {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  executionPhase?: "idle" | "queued" | "running" | "done" | "failed";
  executionLabel?: string;
  assigneeSlug: string | null;
  children: ProjectRosterTaskNode[];
}

export interface ProjectRosterTreeNode {
  project: ProjectRosterEntry;
  tasks: ProjectRosterTaskNode[];
}

export interface SkillRecord {
  slug: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  promptFragment: string;
  default?: boolean;
  assignedAgentSlugs?: string[];
}

export interface ConversationRecord {
  id: string;
  agentSlug: string;
  projectId: string | null;
  title: string | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
  toolsUsed?: string[];
  agentUsed?: "llm" | "stub";
  model?: string;
  /**
   * Where the turn's time went, rendered by Core.
   *
   * Deliberately a string and not the structured numbers: the CLI prints the same sentence from the same
   * function, so the two surfaces cannot describe one turn differently. Measured 2026-09-26 taking suite 07
   * (run 3): a turn spent **955 s over five in-turn model calls** and neither surface could say so.
   */
  accounting_line?: string;
}

export interface GoalAudit {
  goal: { id: string; objective: string; status: string; projectId: string };
  workItemId?: string | null;
  tasks: Array<{ id: string; title: string; status: string; input?: Record<string, unknown> }>;
  jobs: Array<{
    id: string;
    taskId: string;
    status: string;
    capabilities?: string[];
    input?: Record<string, unknown>;
    leaseId?: string;
    leaseExpiresAt?: string;
    startedAt?: string;
    logs?: Array<{ occurredAt: string; line: string }>;
  }>;
  results: Array<{
    jobId: string;
    status: string;
    output?: Record<string, unknown>;
    error?: Record<string, unknown>;
    finishedAt?: string;
  }>;
}

export interface AgentDashboardWorkItem {
  id: string;
  title: string;
  status: string;
  projectSlug: string;
  projectName: string;
  assigneeSlug: string;
  routingReason?: string;
}

export interface AgentDashboard {
  agentSlug: string;
  agentName: string;
  includeSubordinates: boolean;
  byStatus: Record<string, AgentDashboardWorkItem[]>;
  total: number;
}

export interface AgentMemory {
  id: string;
  agentId: string;
  kind: "log" | "learning";
  title: string;
  body: string;
  summary: string | null;
  relevance: number;
  projectId: string | null;
  conversationId: string | null;
  workItemId: string | null;
  metadata: Record<string, unknown>;
  accessCount: number;
  firstAccessedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilesystemSettings {
  folders: Array<{ id: string; path: string; label?: string; readOnly?: boolean }>;
}

export interface RuntimeStatus {
  workersOnline: number;
  /** Every worker that has ever registered, still there or not. */
  workersKnown?: number;
  queuedJobs: number;
  runningJobs: number;
  zombieJobs?: number;
}

export interface AgentQuestion {
  id: string;
  projectId?: string;
  workItemId?: string;
  question: string;
  context?: string;
  status: "pending" | "answered";
  askedByAgentId: string;
  recipientAgentId: string;
  askedByAgentSlug: string;
  recipientAgentSlug: string;
  escalationPathSlugs: string[];
  answer?: string;
  createdAt: string;
}

export interface AgentBlockage {
  id: string;
  projectId?: string;
  workItemId?: string;
  description: string;
  context?: string;
  status: "pending" | "resolved";
  reportedByAgentId: string;
  recipientAgentId: string;
  reportedByAgentSlug: string;
  recipientAgentSlug: string;
  escalationPathSlugs: string[];
  resolution?: string;
  resolutionKind?: "resolved" | "delegated" | "converted_to_question" | "escalated";
  createdAt: string;
}

export type JournalEntryKind =
  | "delegation"
  | "completion_report"
  | "question_raised"
  | "question_answered"
  | "question_escalated"
  | "blocker_reported"
  | "blocker_resolved"
  | "blocker_delegated"
  | "blocker_escalated"
  | "blocker_converted"
  | "audit_proposal"
  /** A closure rule refused a work item: the rule, the field it read, and the command that clears it. */
  | "closure_refused";

export interface WorkItemJournalEntry {
  id: string;
  kind: JournalEntryKind;
  title: string;
  body: string;
  occurredAt: string;
  workItem: { id: string; title: string };
  anchorWorkItemId: string;
  fromAgent?: { id: string; slug: string; name: string };
  toAgent?: { id: string; slug: string; name: string };
  refType?: string;
  refId?: string;
  metadata: Record<string, unknown>;
}

export type WikiPageStatus = "draft" | "pending_approval" | "published" | "archived";

export interface WikiPageRecord {
  id: string;
  projectId: string;
  parentId?: string;
  phaseKey?: string;
  slug: string;
  title: string;
  contentMd: string;
  status: WikiPageStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WikiPageTreeNode {
  page: WikiPageRecord;
  children: WikiPageTreeNode[];
}

export interface WikiLinkRef {
  slug: string;
  label?: string;
  title?: string;
  exists: boolean;
  pageId?: string;
}

export interface WikiCommentTreeNode {
  comment: {
    id: string;
    pageId: string;
    projectId: string;
    parentCommentId?: string;
    authorAgentId?: string;
    authorSlug?: string;
    authorName?: string;
    content: string;
    createdAt: string;
  };
  children: WikiCommentTreeNode[];
}

export interface WikiPageDetail {
  page: WikiPageRecord;
  links: WikiLinkRef[];
  backlinks: Array<{ slug: string; title: string; pageId: string }>;
  comments: WikiCommentTreeNode[];
  pendingEdit?: {
    title?: string;
    contentMd: string;
    proposedBySlug?: string;
    proposedAt?: string;
  };
}

export interface WikiTreeResponse {
  projectId: string;
  projectSlug: string;
  tree: WikiPageTreeNode[];
  pageCount: number;
  pendingCount: number;
  hasRoadmap: boolean;
}

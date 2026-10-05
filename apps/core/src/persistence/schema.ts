import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug"),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status"),
  projectLeadAgentId: text("project_lead_agent_id"),
  coherenceStrategy: text("coherence_strategy"),
  planGranularity: text("plan_granularity"),
  wikiSyncRequired: integer("wiki_sync_required").default(0),
  wikiSyncPageSlug: text("wiki_sync_page_slug"),
  wikiSyncPhasePagesJson: text("wiki_sync_phase_pages_json"),
  repositoriesJson: text("repositories_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  objective: text("objective").notNull(),
  priority: integer("priority").default(0),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  inputJson: text("input_json").notNull(),
  acceptanceCriteriaJson: text("acceptance_criteria_json"),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  status: text("status").notNull(),
  leaseId: text("lease_id"),
  leaseExpiresAt: text("lease_expires_at"),
  workerId: text("worker_id"),
  capabilitiesJson: text("capabilities_json").notNull(),
  inputJson: text("input_json").notNull(),
  idempotencyKey: text("idempotency_key"),
  // When the job was queued. Nullable because rows written before 2026-10-05 have no value and the
  // store will not invent one: a job list that guessed a creation time would be stating a measurement
  // it never took (BOARD F-078).
  createdAt: text("created_at"),
});

export const jobResults = sqliteTable("job_results", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  leaseId: text("lease_id").notNull(),
  status: text("status").notNull(),
  outputJson: text("output_json"),
  errorJson: text("error_json"),
  finishedAt: text("finished_at").notNull(),
});

export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  name: text("name"),
  version: text("version"),
  capabilitiesJson: text("capabilities_json").notNull(),
  contractVersion: text("contract_version").notNull(),
  registeredAt: text("registered_at").notNull(),
  // The last time this worker was heard from. A worker polls for work every couple of seconds, so
  // that poll is its heartbeat — see `touchWorker`. Before this column existed the only sighting was
  // `registeredAt`, written once, and `workersOnline` counted every worker that had **ever**
  // registered: measured 2026-09-29, a worker killed 25 s earlier still read as online (BOARD F-074).
  lastSeenAt: text("last_seen_at"),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  correlationId: text("correlation_id"),
  payloadJson: text("payload_json").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const bootstrapState = sqliteTable("bootstrap_state", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  source: text("source").notNull(),
  responsibilities: text("responsibilities").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const projectDocuments = sqliteTable("project_documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  parentId: text("parent_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  contentMd: text("content_md").notNull(),
  status: text("status").notNull().default("published"),
  sortOrder: integer("sort_order").notNull().default(0),
  proposedContentMd: text("proposed_content_md"),
  proposedTitle: text("proposed_title"),
  proposedByAgentId: text("proposed_by_agent_id"),
  proposedAt: text("proposed_at"),
  approvedByAgentId: text("approved_by_agent_id"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const wikiPageComments = sqliteTable("wiki_page_comments", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  projectId: text("project_id").notNull(),
  parentCommentId: text("parent_comment_id"),
  authorAgentId: text("author_agent_id"),
  authorName: text("author_name"),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const roadmapMilestones = sqliteTable("roadmap_milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetDate: text("target_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull(),
  successCriteriaJson: text("success_criteria_json"),
  executedBy: text("executed_by"),
});

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  parentId: text("parent_id"),
  phaseKey: text("phase_key"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  priority: integer("priority").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  assigneeAgentId: text("assignee_agent_id"),
  assignedByAgentId: text("assigned_by_agent_id"),
  routingReason: text("routing_reason"),
  acceptanceCriteriaJson: text("acceptance_criteria_json"),
  // Paths this work item must not modify, as the plan declares them. Derived freezes are recomputed at
  // dispatch from the item's own text, so this column is only the half a planner states explicitly — see
  // `deriveFrozenPaths` and BOARD F-098.
  frozenPathsJson: text("frozen_paths_json"),
  dependsOnJson: text("depends_on_json"),
  complexityJson: text("complexity_json"),
  goalId: text("goal_id"),
  jobId: text("job_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const delegationEvents = sqliteTable("delegation_events", {
  id: text("id").primaryKey(),
  workItemId: text("work_item_id").notNull(),
  fromAgentId: text("from_agent_id"),
  toAgentId: text("to_agent_id").notNull(),
  reason: text("reason").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  agentSlug: text("agent_slug").notNull(),
  projectId: text("project_id"),
  title: text("title"),
  summary: text("summary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCallsJson: text("tool_calls_json"),
  toolCallId: text("tool_call_id"),
  createdAt: text("created_at").notNull(),
});

export const skills = sqliteTable("skills", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  capabilitiesJson: text("capabilities_json").notNull(),
  toolsJson: text("tools_json").notNull(),
  promptFragment: text("prompt_fragment").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const agentSkills = sqliteTable(
  "agent_skills",
  {
    agentId: text("agent_id").notNull(),
    skillSlug: text("skill_slug").notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.skillSlug] })],
);

export const agentQuestions = sqliteTable("agent_questions", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  workItemId: text("work_item_id"),
  askedByAgentId: text("asked_by_agent_id").notNull(),
  recipientAgentId: text("recipient_agent_id").notNull(),
  question: text("question").notNull(),
  context: text("context"),
  status: text("status").notNull(),
  answer: text("answer"),
  answeredByAgentId: text("answered_by_agent_id"),
  escalationPathJson: text("escalation_path_json").notNull(),
  workItemStatusBeforePause: text("work_item_status_before_pause"),
  createdAt: text("created_at").notNull(),
  answeredAt: text("answered_at"),
});

export const agentBlockages = sqliteTable("agent_blockages", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  workItemId: text("work_item_id"),
  reportedByAgentId: text("reported_by_agent_id").notNull(),
  recipientAgentId: text("recipient_agent_id").notNull(),
  description: text("description").notNull(),
  context: text("context"),
  status: text("status").notNull(),
  resolution: text("resolution"),
  resolutionKind: text("resolution_kind"),
  resolvedByAgentId: text("resolved_by_agent_id"),
  escalationPathJson: text("escalation_path_json").notNull(),
  workItemStatusBeforePause: text("work_item_status_before_pause"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const workItemJournalEntries = sqliteTable("work_item_journal_entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  workItemId: text("work_item_id").notNull(),
  anchorWorkItemId: text("anchor_work_item_id").notNull(),
  kind: text("kind").notNull(),
  fromAgentId: text("from_agent_id"),
  toAgentId: text("to_agent_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  occurredAt: text("occurred_at").notNull(),
});

export const postActionReviews = sqliteTable("post_action_reviews", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  agentId: text("agent_id"),
  agentSlug: text("agent_slug").notNull(),
  projectId: text("project_id").notNull(),
  workItemId: text("work_item_id"),
  referenceId: text("reference_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  inputJson: text("input_json").notNull(),
  resultJson: text("result_json").notNull(),
  projectionsJson: text("projections_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentMemories = sqliteTable("agent_memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  summary: text("summary"),
  relevance: integer("relevance").notNull().default(3),
  projectId: text("project_id"),
  conversationId: text("conversation_id"),
  workItemId: text("work_item_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  accessCount: integer("access_count").notNull().default(0),
  firstAccessedAt: text("first_accessed_at"),
  lastAccessedAt: text("last_accessed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Out-of-scope work the factory declined to accept.
 *
 * A refusal is a decision the factory made on the operator's behalf, so it needs the same durable
 * standing as a question or a blocker. Without this table the refusal lived only in a reply: the
 * operator could not see what was declined, and the boundary could not be counted or audited.
 *
 * Deliberately not a work item: a container for refused work would put out-of-scope work in the plan,
 * which is what the refusal exists to prevent.
 */
export const scopeRefusals = sqliteTable("scope_refusals", {
  id: text("id").primaryKey(),
  request: text("request").notNull(),
  boundary: text("boundary").notNull(),
  boundaryStatement: text("boundary_statement").notNull(),
  refusedByAgentId: text("refused_by_agent_id"),
  projectId: text("project_id"),
  conversationId: text("conversation_id"),
  surface: text("surface").notNull(),
  createdAt: text("created_at").notNull(),
});

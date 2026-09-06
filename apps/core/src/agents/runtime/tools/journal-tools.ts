import {
  listProjectJournal,
  listWorkItemJournal,
} from "../../../application/pm/journal.js";
import {
  recordAuditProposalJournal,
  recordDeliverableAuditJournal,
  recordManualCompletionReportJournal,
} from "../../../application/pm/journal-events.js";
import type { KampakuToolContext } from "./index.js";

export interface SubmitCompletionReportArgs {
  agent_slug: string;
  work_item_id: string;
  summary: string;
  details?: string;
}

const COMPLETION_REPORT_SECTIONS = [
  "decisions",
  "files",
  "check results",
  "ac verification",
  "follow-ups",
] as const;

export function validateCompletionReport(args: SubmitCompletionReportArgs): void {
  if (args.summary.trim().length < 20) {
    throw new Error("Completion report summary must be at least 20 characters and state the concrete outcome.");
  }
  const details = args.details?.trim() ?? "";
  if (details.length < 40) {
    throw new Error("Completion report details must include evidence, decisions, checks, acceptance, and follow-ups.");
  }
  const normalized = details.toLowerCase();
  const missing = COMPLETION_REPORT_SECTIONS.filter((section) => !normalized.includes(section));
  if (missing.length > 0) {
    throw new Error(`Completion report is missing sections: ${missing.join(", ")}.`);
  }
}

export interface GetProjectJournalArgs {
  project_id: string;
  work_item_id?: string;
  limit?: number;
}

export interface GetWorkItemJournalArgs {
  work_item_id: string;
  limit?: number;
}

export interface GetReportingStatusArgs {
  agent_slug: string;
  project_id: string;
  work_item_id: string;
  require_wiki_sync?: boolean;
}

export function executeGetReportingStatus(ctx: KampakuToolContext, args: GetReportingStatusArgs) {
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug);
  if (!agent) throw new Error("Agent not found.");
  const item = ctx.pmStore.getWorkItem(args.work_item_id);
  if (!item || item.projectId !== args.project_id) throw new Error("Work item does not belong to the project.");
  const entries = assertJournalStore(ctx).listForWorkItem(item.id);
  const completionReport = entries.some((entry) => entry.kind === "completion_report" && entry.fromAgentId === agent.id);
  const privateLogs = ctx.memoryStore.list({ agentId: agent.id, kind: "log", projectId: args.project_id, limit: 100 }).filter((memory) => memory.workItemId === item.id).length;
  const pages = ctx.wikiStore?.listPagesByProject(args.project_id) ?? [];
  const wikiSync = pages.some((page) => page.status === "published" && page.updatedAt >= item.updatedAt);
  const required = args.require_wiki_sync === true ? [completionReport, privateLogs > 0, wikiSync] : [completionReport, privateLogs > 0];
  return {
    workItemId: item.id,
    superiorJournal: { completionReport },
    privateMemory: { logCount: privateLogs, present: privateLogs > 0 },
    sharedWiki: { publishedPages: pages.filter((page) => page.status === "published").length, synchronized: wikiSync },
    readyForClosure: required.every(Boolean),
    missing: [!completionReport && "completion_report", privateLogs === 0 && "private_memory_log", args.require_wiki_sync === true && !wikiSync && "wiki_sync"].filter(Boolean),
  };
}

export interface ProposeAuditImprovementArgs {
  agent_slug: string;
  project_id: string;
  anchor_work_item_id?: string;
  title: string;
  proposal: string;
  target_agent_slug?: string;
  target_skill_slug?: string;
}

function assertJournalStore(ctx: KampakuToolContext) {
  if (!ctx.journalStore) throw new Error("Journal store is not available.");
  return ctx.journalStore;
}

const PLATFORM_AUDIT_SKILLS = new Set(["system-audit", "audit-platform-flows"]);

function assertAuditAccess(ctx: KampakuToolContext, agentSlug: string): void {
  const agent = ctx.agentStore.getAgentBySlugOrId(agentSlug);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (!skills.some((slug) => PLATFORM_AUDIT_SKILLS.has(slug))) {
    throw new Error("Only agents with system-audit or audit-platform-flows can propose audit improvements.");
  }
}

const DELIVERABLE_AUDIT_SKILLS = new Set([
  "audit-deliverable-readiness",
  "audit-phase-gate",
  "system-audit",
]);

function assertDeliverableAuditAccess(ctx: KampakuToolContext, agentSlug: string): void {
  const agent = ctx.agentStore.getAgentBySlugOrId(agentSlug);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (!skills.some((slug) => DELIVERABLE_AUDIT_SKILLS.has(slug))) {
    throw new Error(
      "Only agents with audit-deliverable-readiness or audit-phase-gate can propose deliverable findings.",
    );
  }
}

function canReportForWorkItem(
  ctx: KampakuToolContext,
  agentSlug: string,
  workItemId: string,
): void {
  const agent = ctx.agentStore.getAgentBySlugOrId(agentSlug);
  if (!agent) throw new Error("Agent not found.");
  const workItem = ctx.pmStore.getWorkItem(workItemId);
  if (!workItem) throw new Error("Work item not found.");

  const isAssignee = workItem.assigneeAgentId === agent.id;
  const isSuperior =
    workItem.assignedByAgentId === agent.id ||
    (workItem.parentId &&
      ctx.pmStore.getWorkItem(workItem.parentId)?.assigneeAgentId === agent.id);

  if (!isAssignee && !isSuperior) {
    throw new Error("Only the assignee or their superior can submit a completion report.");
  }
}

export function executeSubmitCompletionReport(
  ctx: KampakuToolContext,
  args: SubmitCompletionReportArgs,
) {
  validateCompletionReport(args);
  canReportForWorkItem(ctx, args.agent_slug, args.work_item_id);
  recordManualCompletionReportJournal(assertJournalStore(ctx), ctx.pmStore, {
    workItemId: args.work_item_id,
    fromAgentId: ctx.agentStore.getAgentBySlugOrId(args.agent_slug)!.id,
    summary: args.summary,
    details: args.details,
  });
  return {
    message: "Completion report recorded on the parent task journal.",
    workItemId: args.work_item_id,
  };
}

export function executeGetProjectJournal(ctx: KampakuToolContext, args: GetProjectJournalArgs) {
  const journalStore = assertJournalStore(ctx);
  const entries = listProjectJournal(
    journalStore,
    ctx.pmStore,
    ctx.agentStore,
    args.project_id,
    { workItemId: args.work_item_id, limit: args.limit ?? 50 },
  );
  return { entries, count: entries.length };
}

export function executeGetWorkItemJournal(ctx: KampakuToolContext, args: GetWorkItemJournalArgs) {
  const journalStore = assertJournalStore(ctx);
  const entries = listWorkItemJournal(
    journalStore,
    ctx.pmStore,
    ctx.agentStore,
    args.work_item_id,
    { limit: args.limit ?? 50 },
  );
  return { entries, count: entries.length };
}

export interface ProposeDeliverableFindingArgs {
  agent_slug: string;
  project_id: string;
  title: string;
  evidence: string;
  severity: "blocker" | "high" | "medium" | "low";
  recommendation?: string;
  anchor_work_item_id?: string;
}

export function executeProposeDeliverableFinding(
  ctx: KampakuToolContext,
  args: ProposeDeliverableFindingArgs,
) {
  assertDeliverableAuditAccess(ctx, args.agent_slug);
  const journalStore = assertJournalStore(ctx);
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug)!;

  let anchorWorkItemId = args.anchor_work_item_id;
  if (!anchorWorkItemId) {
    const rootItems = ctx.pmStore
      .listWorkItemsByProject(args.project_id)
      .filter((item) => !item.parentId);
    anchorWorkItemId = rootItems[0]?.id;
  }
  if (!anchorWorkItemId) {
    throw new Error("No anchor work item found for this deliverable finding.");
  }

  recordDeliverableAuditJournal(journalStore, ctx.pmStore, {
    projectId: args.project_id,
    anchorWorkItemId,
    fromAgentId: agent.id,
    title: args.title.trim(),
    body: args.evidence.trim(),
    severity: args.severity,
    recommendation: args.recommendation?.trim(),
  });

  return {
    message: "Deliverable audit finding recorded in the project journal.",
    anchorWorkItemId,
  };
}

export function executeProposeAuditImprovement(
  ctx: KampakuToolContext,
  args: ProposeAuditImprovementArgs,
) {
  assertAuditAccess(ctx, args.agent_slug);
  const journalStore = assertJournalStore(ctx);
  const agent = ctx.agentStore.getAgentBySlugOrId(args.agent_slug)!;

  let anchorWorkItemId = args.anchor_work_item_id;
  if (!anchorWorkItemId) {
    const rootItems = ctx.pmStore
      .listWorkItemsByProject(args.project_id)
      .filter((item) => !item.parentId);
    anchorWorkItemId = rootItems[0]?.id;
  }
  if (!anchorWorkItemId) {
    throw new Error("No anchor work item found for this audit proposal.");
  }

  recordAuditProposalJournal(journalStore, ctx.pmStore, {
    projectId: args.project_id,
    anchorWorkItemId,
    fromAgentId: agent.id,
    title: args.title.trim(),
    body: args.proposal.trim(),
    metadata: {
      targetAgentSlug: args.target_agent_slug,
      targetSkillSlug: args.target_skill_slug,
    },
  });

  return {
    message: "Audit proposal recorded in the project journal.",
    anchorWorkItemId,
  };
}

export const SUBMIT_COMPLETION_REPORT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_completion_report",
    description:
      "Submit a structured completion report to your superior. Details must include Decisions, Files, Check results, AC verification, and Follow-ups. The report is stored on the parent task journal for tracking.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Your agent slug." },
        work_item_id: { type: "string", description: "Completed work item UUID." },
        summary: { type: "string", description: "Short outcome summary for your superior." },
        details: { type: "string", description: "Required structured details with Decisions, Files, Check results, AC verification, and Follow-ups." },
      },
      required: ["agent_slug", "work_item_id", "summary", "details"],
    },
  },
};

export const GET_PROJECT_JOURNAL_TOOL = {
  type: "function" as const,
  function: {
    name: "get_project_journal",
    description: "Read the project communication journal (timeline of delegations, reports, questions, and blockers).",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project UUID." },
        work_item_id: { type: "string", description: "Optional anchor work item filter." },
        limit: { type: "number", description: "Max entries (default 50)." },
      },
      required: ["project_id"],
    },
  },
};

export const GET_WORK_ITEM_JOURNAL_TOOL = {
  type: "function" as const,
  function: {
    name: "get_work_item_journal",
    description: "Read journal entries anchored to a parent work item (supervisor inbox).",
    parameters: {
      type: "object",
      properties: {
        work_item_id: { type: "string", description: "Anchor work item UUID." },
        limit: { type: "number", description: "Max entries (default 50)." },
      },
      required: ["work_item_id"],
    },
  },
};

export const GET_REPORTING_STATUS_TOOL = {
  type: "function" as const,
  function: {
    name: "get_reporting_status",
    description: "Check whether a work item has synchronized superior-journal, private-memory, and optional shared-wiki reporting evidence before closure.",
    parameters: { type: "object", properties: {
      agent_slug: { type: "string" }, project_id: { type: "string" }, work_item_id: { type: "string" }, require_wiki_sync: { type: "boolean" },
    }, required: ["agent_slug", "project_id", "work_item_id"] },
  },
};

export const PROPOSE_DELIVERABLE_FINDING_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_deliverable_finding",
    description:
      "Record a repo deliverable audit finding (structure, tests, API contract, OSS hygiene). Auditor agents only.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Your auditor agent slug." },
        project_id: { type: "string", description: "Project UUID." },
        anchor_work_item_id: { type: "string", description: "Optional parent work item to attach the finding." },
        title: { type: "string", description: "Short finding title." },
        evidence: { type: "string", description: "Evidence: file paths, command output, or journal quotes." },
        severity: {
          type: "string",
          enum: ["blocker", "high", "medium", "low"],
          description: "Finding severity.",
        },
        recommendation: { type: "string", description: "Optional recommended fix." },
      },
      required: ["agent_slug", "project_id", "title", "evidence", "severity"],
    },
  },
};

export const PROPOSE_AUDIT_IMPROVEMENT_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_audit_improvement",
    description:
      "Propose improvements to team structure, skills, or system prompts based on journal evidence. Auditor only.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string", description: "Your auditor agent slug." },
        project_id: { type: "string", description: "Project UUID." },
        anchor_work_item_id: { type: "string", description: "Optional parent work item to attach the proposal." },
        title: { type: "string", description: "Short proposal title." },
        proposal: { type: "string", description: "Detailed recommendation with journal evidence." },
        target_agent_slug: { type: "string", description: "Optional agent slug to improve." },
        target_skill_slug: { type: "string", description: "Optional skill slug to improve." },
      },
      required: ["agent_slug", "project_id", "title", "proposal"],
    },
  },
};

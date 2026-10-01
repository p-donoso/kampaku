import type { AgentStore } from "../../persistence/agent-store.js";
import type {
  JournalEntryKind,
  JournalStore,
  WorkItemJournalEntryRecord,
} from "../../persistence/journal-store.js";
import type { PmStore } from "../../persistence/pm-store.js";

/**
 * The register of project risks, and the one place a risk disposition is written.
 *
 * A risk has one storage: the operational journal. A `risk_reported` entry **is** the risk — the entry's
 * own id is the risk id — and each `risk_updated` entry carries `metadata.riskId` back to it with the new
 * status. No new table, no migration, and no second representation that could drift from the one the
 * execution gate counts.
 *
 * Exported for one reason beyond reading it: the operator surface and the agent tool must dispose of a
 * risk **the same way**, or the platform would have two rules for who may accept an exposure and what an
 * acceptance has to say. `executeUpdateRisk` (`agents/runtime/tools/risks.ts`) calls `disposeRisk` here.
 *
 * Measured 2026-10-01 on suite 08 run `s08r7` (BOARD F-084): `play` refused with
 * `open_high_risk: "1 high or critical risk(s) require disposition"`, and the operator had no surface to
 * read the risk the sentence was about or to answer it — so an `autoExecute` project stopped on a gate
 * nobody could clear.
 */

export type RiskProbability = "low" | "medium" | "high";
export type RiskImpact = "low" | "medium" | "high" | "critical";
export type RiskStatus = "open" | "mitigated" | "accepted" | "escalated";
export type RiskAction = "mitigate" | "accept" | "escalate";

/** The impacts the execution gate treats as requiring a disposition. */
export const BLOCKING_RISK_IMPACTS: RiskImpact[] = ["high", "critical"];

export interface RiskDispositionRecord {
  id: string;
  action: RiskAction | string;
  status: RiskStatus;
  /** The concrete outcome: what changed, why the exposure is accepted, or where it was escalated. */
  outcome: string;
  /** The agent that recorded the update, when one did. */
  byAgentSlug?: string;
  /** Who accepts the exposure. `operator` for a disposition the emperor answered directly. */
  acceptedBy?: string;
  at: string;
}

export interface ProjectRisk {
  /** The id of the `risk_reported` entry — what `play` refers to, and what a disposition names. */
  id: string;
  projectId: string;
  /** Filled in by the routes, which are the layer that holds the project registry. */
  projectSlug?: string;
  title: string;
  description: string;
  probability?: RiskProbability;
  impact?: RiskImpact;
  mitigation: string;
  reviewAt: string;
  status: RiskStatus;
  /** True when this risk is what stops `play`: open, and high or critical impact. */
  blocksExecution: boolean;
  workItem?: { id: string; title: string };
  reportedByAgentSlug?: string;
  reportedAt: string;
  /** The most recent disposition, if any. */
  disposition?: RiskDispositionRecord;
  /** Every disposition recorded for this risk, oldest first. */
  history: RiskDispositionRecord[];
}

export class RiskError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION",
  ) {
    super(message);
    this.name = "RiskError";
  }
}

const STATUS_BY_ACTION: Record<RiskAction, RiskStatus> = {
  mitigate: "mitigated",
  accept: "accepted",
  escalate: "escalated",
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Reads the fields `report_risk` writes into the entry's body.
 *
 * The body is the durable record a person reads, so a risk reported by an older build (or by hand) must
 * still render: an unknown shape degrades to the raw body as the description rather than throwing. The
 * metadata is the machine-readable half and is preferred when present.
 */
export function parseRiskBody(body: string): {
  description: string;
  probability?: string;
  impact?: string;
  mitigation: string;
  reviewAt: string;
} {
  const fields: Record<string, string> = {};
  const lines = body.split("\n");
  let descriptionLines: string[] = [];
  for (const line of lines) {
    const match = /^(Description|Probability|Impact|Mitigation|Review at):\s*(.*)$/.exec(line);
    if (match) {
      fields[match[1]!] = match[2]!.trim();
      continue;
    }
    if (Object.keys(fields).length === 0) descriptionLines.push(line);
  }
  return {
    description: (fields.Description ?? descriptionLines.join("\n")).trim(),
    probability: fields.Probability,
    impact: fields.Impact,
    mitigation: fields.Mitigation ?? "Not defined",
    reviewAt: fields["Review at"] ?? "Not scheduled",
  };
}

/** Strips the `Risk: ` label `report_risk` prefixes to the entry title. */
export function parseRiskTitle(title: string): string {
  return title.replace(/^Risk(?: (?:mitigated|accepted|escalated))?:\s*/i, "").trim() || title.trim();
}

function toStatus(raw: unknown): RiskStatus | undefined {
  const value = readString(raw);
  if (value === "open" || value === "mitigated" || value === "accepted" || value === "escalated") {
    return value;
  }
  return undefined;
}

function isBlocking(risk: { status: RiskStatus; impact?: string }): boolean {
  return risk.status === "open" && (risk.impact === "high" || risk.impact === "critical");
}

/**
 * Every risk in a project, derived from the journal.
 *
 * Entries are replayed in order, so a disposition written after another one wins, exactly as the gate
 * overlays them. The result is ordered **blocking risks first, newest first within each group**, because
 * the one question this read answers is "which risk is stopping the line?".
 */
export function listProjectRisks(
  journalStore: JournalStore,
  pmStore: PmStore,
  agentStore: AgentStore | undefined,
  projectId: string,
): ProjectRisk[] {
  const entries = journalStore.listByProject(projectId, {
    kinds: ["risk_reported", "risk_updated"] as JournalEntryKind[],
    limit: 500,
  });

  const slugById = new Map(
    (agentStore?.listAllAgents() ?? []).map((agent) => [agent.id, agent.slug]),
  );
  const risks = new Map<string, ProjectRisk>();
  const dispositions = new Map<string, RiskDispositionRecord[]>();

  for (const entry of [...entries].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const riskId = entry.metadata.riskId;
    if (entry.kind === "risk_updated" && typeof riskId === "string") {
      const record = dispositions.get(riskId) ?? [];
      record.push({
        id: entry.id,
        action: readString(entry.metadata.action) ?? "update",
        status: toStatus(entry.metadata.status) ?? "open",
        outcome: entry.body,
        byAgentSlug: entry.fromAgentId ? slugById.get(entry.fromAgentId) : undefined,
        acceptedBy: readString(entry.metadata.acceptedBy),
        at: entry.occurredAt,
      });
      dispositions.set(riskId, record);
      continue;
    }
    if (entry.kind !== "risk_reported") continue;

    const parsed = parseRiskBody(entry.body);
    const workItem = pmStore.getWorkItem(entry.workItemId);
    const risk: ProjectRisk = {
      id: entry.id,
      projectId: entry.projectId,
      title: parseRiskTitle(entry.title),
      description: parsed.description,
      probability: (readString(entry.metadata.probability) ?? parsed.probability) as RiskProbability | undefined,
      impact: (readString(entry.metadata.impact) ?? parsed.impact) as RiskImpact | undefined,
      mitigation: parsed.mitigation,
      reviewAt: readString(entry.metadata.reviewAt) ?? parsed.reviewAt,
      status: toStatus(entry.metadata.status) ?? "open",
      blocksExecution: false,
      workItem: workItem ? { id: workItem.id, title: workItem.title } : undefined,
      reportedByAgentSlug: entry.fromAgentId ? slugById.get(entry.fromAgentId) : undefined,
      reportedAt: entry.occurredAt,
      history: [],
    };
    risks.set(entry.id, risk);
  }

  const listed = [...risks.values()].map((risk) => {
    const history = dispositions.get(risk.id) ?? [];
    const latest = history.at(-1);
    return {
      ...risk,
      status: latest?.status ?? risk.status,
      history,
      disposition: latest,
    };
  });

  for (const risk of listed) risk.blocksExecution = isBlocking(risk);

  return listed.sort((a, b) => {
    if (a.blocksExecution !== b.blocksExecution) return a.blocksExecution ? -1 : 1;
    return b.reportedAt.localeCompare(a.reportedAt);
  });
}

export function getProjectRisk(
  journalStore: JournalStore,
  pmStore: PmStore,
  agentStore: AgentStore | undefined,
  riskId: string,
): ProjectRisk | undefined {
  const entry = journalStore.getById(riskId);
  if (!entry || entry.kind !== "risk_reported") return undefined;
  return listProjectRisks(journalStore, pmStore, agentStore, entry.projectId).find(
    (risk) => risk.id === riskId,
  );
}

/** The risks that stop `play`, for the gate's own sentence. */
export function listBlockingRisks(
  journalStore: JournalStore,
  pmStore: PmStore,
  agentStore: AgentStore | undefined,
  projectId: string,
): ProjectRisk[] {
  return listProjectRisks(journalStore, pmStore, agentStore, projectId).filter(
    (risk) => risk.blocksExecution,
  );
}

export interface DisposeRiskArgs {
  riskId: string;
  action: RiskAction;
  /** What changed (mitigation), why the exposure is accepted, or where it went (escalation). */
  outcome: string;
  /** The agent recording it. Absent for a disposition the emperor gave directly. */
  agentId?: string;
  /** Who accepts the exposure. Required for `accept`, and only meaningful there. */
  acceptedBy?: string;
}

/**
 * Writes a disposition. The only writer, for every surface.
 *
 * Two rules are enforced here rather than in a prompt, because both are the difference between a gate
 * that means something and a status field:
 *
 * 1. **An acceptance says who accepts the exposure and why.** `acceptedBy` is required for `accept`, and
 *    the default is `operator` — the emperor answering the gate in person is a named actor, not a blank.
 * 2. **An outcome is required.** "Mitigated" with nothing after it is a status change with no fact
 *    behind it, and the gate would clear on a word.
 */
export function disposeRisk(
  journalStore: JournalStore,
  pmStore: PmStore,
  args: DisposeRiskArgs,
): { riskId: string; updateId: string; status: RiskStatus } {
  const existing = journalStore.getById(args.riskId);
  if (!existing || existing.kind !== "risk_reported") {
    throw new RiskError(`Risk not found: ${args.riskId}`, "NOT_FOUND");
  }

  if (!["mitigate", "accept", "escalate"].includes(args.action)) {
    throw new RiskError(
      `Unknown action "${args.action}". Use mitigate, accept, or escalate.`,
      "VALIDATION",
    );
  }
  const outcome = args.outcome.trim();
  if (!outcome) {
    throw new RiskError(
      "A disposition needs a concrete outcome: what changed, why the exposure is accepted, or where it went.",
      "VALIDATION",
    );
  }
  if (args.action === "accept" && args.acceptedBy !== undefined && !args.acceptedBy.trim()) {
    throw new RiskError('--accepted-by cannot be empty; name who accepts the exposure.', "VALIDATION");
  }

  const status = STATUS_BY_ACTION[args.action];
  const acceptedBy = args.action === "accept" ? (args.acceptedBy?.trim() || "operator") : undefined;
  const body = acceptedBy ? `Accepted by ${acceptedBy}: ${outcome}` : outcome;

  const record = journalStore.append({
    projectId: existing.projectId,
    workItemId: existing.workItemId,
    anchorWorkItemId: existing.anchorWorkItemId,
    kind: "risk_updated",
    fromAgentId: args.agentId,
    toAgentId: existing.toAgentId,
    title: `Risk ${status}: ${existing.title}`,
    body,
    refType: "work_item",
    refId: existing.id,
    metadata: {
      action: args.action,
      status,
      riskId: existing.id,
      ...(acceptedBy ? { acceptedBy } : {}),
    },
  });

  return { riskId: existing.id, updateId: record.id, status };
}

/**
 * The gate's sentence, naming the risk instead of counting it.
 *
 * The count was the defect: an operator stopped by `1 high or critical risk(s) require disposition` can
 * neither act on it nor look it up, because the id is the only handle and the sentence did not carry it.
 * A long title is trimmed rather than dropped — the id is what makes it actionable.
 */
export function describeBlockingRisks(blocking: ProjectRisk[], maxLength = 96): string {
  const described = blocking.map((risk) => {
    const title = risk.title.length > maxLength ? `${risk.title.slice(0, maxLength - 1)}…` : risk.title;
    return `"${title}" (${risk.id}, impact ${risk.impact ?? "unknown"})`;
  });
  const label = `${blocking.length} high or critical risk${blocking.length === 1 ? "" : "s"}`;
  return `${label} require${blocking.length === 1 ? "s" : ""} disposition: ${described.join("; ")}`;
}

/** Renders a risk as the block an operator reads: every field, then the disposition. */
export function formatRisk(risk: ProjectRisk): string {
  const lines = [
    `${risk.id}  [${risk.status}]${risk.blocksExecution ? "  — stops play" : ""}`,
    `  ${risk.title}`,
    `  Probability: ${risk.probability ?? "not recorded"}   Impact: ${risk.impact ?? "not recorded"}`,
    `  Reported by: ${risk.reportedByAgentSlug ?? "unknown"} at ${risk.reportedAt}`,
    ...(risk.workItem ? [`  Work item: ${risk.workItem.id}  ${risk.workItem.title}`] : []),
    `  Mitigation: ${risk.mitigation}`,
    `  Review at: ${risk.reviewAt}`,
    "  Description:",
    ...risk.description.split("\n").map((line) => `    ${line}`),
  ];
  if (risk.disposition) {
    lines.push(
      `  Disposition: ${risk.disposition.status} (${risk.disposition.action}) at ${risk.disposition.at}` +
        `${risk.disposition.byAgentSlug ? ` by ${risk.disposition.byAgentSlug}` : ""}` +
        `${risk.disposition.acceptedBy ? `, accepted by ${risk.disposition.acceptedBy}` : ""}`,
      `    ${risk.disposition.outcome}`,
    );
  } else {
    lines.push("  Disposition: none — this risk is open.");
  }
  return lines.join("\n");
}

export type { WorkItemJournalEntryRecord };

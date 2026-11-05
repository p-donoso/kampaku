import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { AgentStore } from "../../persistence/agent-store.js";
import type { JournalStore } from "../../persistence/journal-store.js";
import type { PmStore, WorkItemRecord } from "../../persistence/pm-store.js";
import type { Store } from "../../persistence/store.js";
import { inferRequiredChecksFromWorkItem } from "./work-item-checks.js";
import { resolveDeclaredCheckCommands, type DeclaredCheckCommand } from "./declared-checks.js";
import { linkedCheckoutPath } from "./leaf-splitter.js";
import { recordPhaseGateJournal } from "./journal-events.js";

export const PHASE_GATE_ROUTING_PREFIX = "phase_gate:";
export const SENSEI_AUDIT_RELATIVE_PATH = "docs/audit/latest.md";

export function buildPhaseGateRoutingReason(phaseWorkItemId: string): string {
  return `${PHASE_GATE_ROUTING_PREFIX}${phaseWorkItemId}`;
}

export function parsePhaseGateRoutingReason(routingReason?: string): { phaseWorkItemId: string } | null {
  if (!routingReason?.startsWith(PHASE_GATE_ROUTING_PREFIX)) return null;
  const phaseWorkItemId = routingReason.slice(PHASE_GATE_ROUTING_PREFIX.length).trim();
  return phaseWorkItemId ? { phaseWorkItemId } : null;
}

export function isPhaseGateWorkItem(item: WorkItemRecord): boolean {
  return parsePhaseGateRoutingReason(item.routingReason) !== null;
}

export function isRootPhaseContainer(item: WorkItemRecord, pmStore: PmStore): boolean {
  if (item.parentId) return false;
  return pmStore.listWorkItemsByProject(item.projectId).some((child) => child.parentId === item.id);
}

export function findPhaseGateWorkItem(
  pmStore: PmStore,
  projectId: string,
  phaseWorkItemId: string,
): WorkItemRecord | undefined {
  return pmStore
    .listWorkItemsByProject(projectId)
    .find((item) => parsePhaseGateRoutingReason(item.routingReason)?.phaseWorkItemId === phaseWorkItemId);
}

export function findNextPhaseGateWorkItem(pmStore: PmStore, projectId: string): WorkItemRecord | null {
  const candidates = pmStore
    .listWorkItemsByProject(projectId)
    .filter((item) => isPhaseGateWorkItem(item) && (item.status === "todo" || item.status === "in_progress"))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return candidates[0] ?? null;
}

function sampleDoneLeaf(leaves: WorkItemRecord[], seed: string): WorkItemRecord | undefined {
  const done = leaves.filter((leaf) => leaf.status === "done" && !isPhaseGateWorkItem(leaf));
  if (done.length === 0) return undefined;
  const index = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % done.length;
  return done[index];
}

/**
 * The criterion that decides whether the audit's sampled re-run is green, in the checkout's own words.
 *
 * Two outcomes, both stated: the primary check the checkout declares, with the file that declares it, or the
 * fact that this repository declares none. The second is a real outcome on a stranger's checkout whose only
 * build file is a `Makefile` without a `test` target, and naming it is better than naming a command the
 * repository cannot run — the gate then asks for the command the auditor actually ran.
 */
export function auditCheckCriterion(declared: DeclaredCheckCommand[]): string {
  const primary = declared[0];
  return primary
    ? `${primary.command} exits 0 (declared by ${primary.evidence}).`
    : "The audit names the command it ran and records that command's output; no check is declared by this repository, so no command is assumed.";
}

/**
 * The seat that signs this project's phase gate.
 *
 * **A platform station never signs an external project's gate.** Measured 2026-10-05 on suite 18's first run
 * (`s18a1`): the gate created for the Python scenario was assigned to `kampaku-auditor`, a station serving the
 * platform's own project, on a work order opened for a stranger's checkout. That run's own cross-check prompt
 * read it back as an isolation defect without being asked to look, and it is right: the gate was signed by
 * somebody who is not accountable to the project it gates, with the project's own team standing idle.
 *
 * The fallbacks are therefore ordered by accountability rather than by name: the project's own auditor, then an
 * auditor under that project's lead, then `kampaku-auditor` **only** for the platform's own project, then the
 * project's lead — who is the honest signer when the project has no auditor seat, and who is already accountable
 * for the leaves the gate is about.
 */
function resolveAuditorAgentId(
  agentStore: AgentStore,
  projectSlug?: string,
  projectLeadAgentId?: string,
): string | undefined {
  const own = projectSlug ? agentStore.getAgentBySlugOrId(`${projectSlug}-auditor`) : undefined;
  if (own) return own.id;
  const lead = projectLeadAgentId ? agentStore.getAgentBySlugOrId(projectLeadAgentId) : undefined;
  const scoped = lead
    ? agentStore.listAllAgents().find((agent) => agent.slug.endsWith("-auditor") && agent.parentId === lead.id)
    : undefined;
  if (scoped) return scoped.id;
  if (!projectSlug || projectSlug === "kampaku") {
    const platform = agentStore.getAgentBySlugOrId("kampaku-auditor");
    if (platform) return platform.id;
  }
  return lead?.id;
}

export function isStubAuditText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 400) return true;
  if (/["']status["']\s*:\s*["']ready["']/i.test(trimmed) && !/verdict|score/i.test(trimmed)) {
    return true;
  }
  if (!/verdict/i.test(trimmed) || !/score/i.test(trimmed)) return true;
  return false;
}

export function auditArtifactIsHonest(input: {
  repositoryPath?: string;
  summary?: string;
}): boolean {
  if (input.repositoryPath) {
    const auditPath = join(input.repositoryPath, SENSEI_AUDIT_RELATIVE_PATH);
    if (existsSync(auditPath)) {
      try {
        return !isStubAuditText(readFileSync(auditPath, "utf8"));
      } catch {
        return false;
      }
    }
  }
  if (input.summary) return !isStubAuditText(input.summary);
  return false;
}

export function ensurePhaseAuditorWorkItem(
  pmStore: PmStore,
  agentStore: AgentStore,
  store: Store,
  phase: WorkItemRecord,
  journalStore?: JournalStore,
): WorkItemRecord | undefined {
  const existing = findPhaseGateWorkItem(pmStore, phase.projectId, phase.id);
  if (existing) return existing;

  const project = store.getProject(phase.projectId);
  const children = pmStore
    .listWorkItemsByProject(phase.projectId)
    .filter((item) => item.parentId === phase.id && !isPhaseGateWorkItem(item));
  const unfinished = children.filter((item) => item.status !== "done" && item.status !== "cancelled");
  if (unfinished.length > 0) return undefined;

  const auditorId = resolveAuditorAgentId(agentStore, project?.slug, project?.projectLeadAgentId);
  if (!auditorId) return undefined;

  const sampled = sampleDoneLeaf(children, phase.id);
  const sampledChecks = sampled ? inferRequiredChecksFromWorkItem(sampled) : [];
  // **The gate's own check criterion is the checkout's, not a template's.** It used to read *"npm test passes
  // when package.json defines a test script"* on every project: a criterion a Python, Rust or Go checkout can
  // neither satisfy nor meaningfully fail — vacuous where it appears, and an ecosystem default in a stack-neutral
  // suite (BOARD F-003; measured again on suite 18's first run `s18a1`, a Makefile-wrapped Python fixture with no
  // `package.json`, and read back by that run's own cross-check prompt as a leaking template).
  const checkoutPath = linkedCheckoutPath(store, phase.projectId);
  const declaredChecks = resolveDeclaredCheckCommands(checkoutPath);
  const checkCriterion = auditCheckCriterion(declaredChecks);
  const sampledCommand = sampled ? declaredChecks[0]?.command : undefined;
  const now = new Date().toISOString();
  const maxSort = children.reduce((max, item) => Math.max(max, item.sortOrder), 0);

  const created = pmStore.createWorkItem({
    id: uuidv4(),
    projectId: phase.projectId,
    parentId: phase.id,
    title: `Audit phase — ${phase.title}`,
    description: [
      `Hard phase gate for "${phase.title}". Do not mark this phase done until a sensei-grade audit artifact exists.`,
      `Write ${SENSEI_AUDIT_RELATIVE_PATH} using the deliverable-readiness rubric (verdict, dimension scores, findings with file evidence).`,
      "Do not emit a stub JSON such as {\"status\":\"ready\"}.",
      sampled
        ? `Sampled leaf AC re-run: "${sampled.title}"${sampledChecks.length > 0 && sampledCommand ? ` — run ${sampledCommand} and record stdout.` : "."}`
        : "Sample one completed leaf and re-run its acceptance commands.",
      "If the gate fails, reopen affected tasks; do not advance to the next track.",
    ].join(" "),
    status: "todo",
    priority: 0,
    sortOrder: maxSort + 10,
    // The audit writes its own artifact; the phase's freezes are not the auditor's to bypass, and the audit
    // leaf's own text declares none.
    frozenPaths: [],
    assigneeAgentId: auditorId,
    acceptanceCriteria: [
      `file exists at ${SENSEI_AUDIT_RELATIVE_PATH}`,
      "docs/audit/latest.md includes Verdict and score with evidence",
      checkCriterion,
    ],
    dependsOn: children.map((item) => item.title),
    routingReason: buildPhaseGateRoutingReason(phase.id),
    createdAt: now,
    updatedAt: now,
  });

  if (journalStore) {
    recordPhaseGateJournal(journalStore, pmStore, {
      projectId: phase.projectId,
      phaseWorkItemId: phase.id,
      phaseTitle: phase.title,
    });
  }

  return created;
}

export function ensurePhaseAuditorAfterLeafDone(
  pmStore: PmStore,
  agentStore: AgentStore | undefined,
  store: Store | undefined,
  completedLeafId: string,
  journalStore?: JournalStore,
): WorkItemRecord | undefined {
  if (!agentStore || !store) return undefined;
  const leaf = pmStore.getWorkItem(completedLeafId);
  if (!leaf?.parentId) return undefined;

  let current = pmStore.getWorkItem(leaf.parentId);
  while (current) {
    if (isRootPhaseContainer(current, pmStore)) {
      return ensurePhaseAuditorWorkItem(pmStore, agentStore, store, current, journalStore);
    }
    current = current.parentId ? pmStore.getWorkItem(current.parentId) : undefined;
  }
  return undefined;
}

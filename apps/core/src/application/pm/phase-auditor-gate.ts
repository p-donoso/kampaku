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

/**
 * Whether this project's audit belongs **inside its checkout**, or in the platform's records.
 *
 * The audit is the platform's paperwork, and the platform's own project is the one checkout whose `docs/` **is**
 * the platform's record — so that is the only one where the artifact lives on disk.
 *
 * Every other project is somebody else's repository, and there the file was an imposition. Measured 2026-11-09 on
 * suite 19 run `s19r17`, scenario M (BOARD F-144): the auditor leaf's own criteria demanded `docs/audit/latest.md`,
 * so job `c1c30b0e` created a `docs/audit/` directory at the top of a brownfield monorepo whose request was one
 * small feature in `packages/orders` and no document at all. The file names itself *"Hard phase gate artifact"* and
 * lists its own path under *Files changed by this phase* — the platform writing into the repository it is grading,
 * which is also what makes suite 19's *No scaffold imposition* oracle unanswerable.
 */
export function auditArtifactLivesInCheckout(projectSlug?: string): boolean {
  return projectSlug === "kampaku";
}

/**
 * The criteria the auditor leaf carries.
 *
 * For the platform's own project: the artifact on disk and the rubric it must satisfy, unchanged.
 *
 * For every other project: **the checkout's own check and nothing that names a path inside it.** The verdict and the
 * score are still demanded — `shouldBlockDishonestSuccess` refuses a phase gate whose recorded audit is missing or a
 * stub (`auditArtifactIsHonest`, which reads the completion report) — but they are demanded *as the platform's
 * record of the audit*, which is where a gate's own evidence belongs, rather than as a new directory in somebody
 * else's tree.
 */
export function auditAcceptanceCriteria(projectSlug: string | undefined, checkCriterion: string): string[] {
  if (!auditArtifactLivesInCheckout(projectSlug)) return [checkCriterion];
  return [
    `file exists at ${SENSEI_AUDIT_RELATIVE_PATH}`,
    `${SENSEI_AUDIT_RELATIVE_PATH} includes Verdict and score with evidence`,
    checkCriterion,
  ];
}

/**
 * What the auditor is told to do, in the words that decide whether it writes a file.
 *
 * The first line is the measured defect's sentence: *"Write docs/audit/latest.md"* on a project that is not the
 * platform's. What replaces it on an external checkout is the same demand recorded where the platform keeps
 * records — plus the instruction the job needed and did not have: this tree is not yours to add to.
 */
export function auditLeafDescription(input: {
  phaseTitle: string;
  projectSlug?: string;
  sampledTitle?: string;
  sampledCommand?: string;
}): string {
  const inCheckout = auditArtifactLivesInCheckout(input.projectSlug);
  return [
    `Hard phase gate for "${input.phaseTitle}". Do not mark this phase done until a sensei-grade audit artifact exists.`,
    inCheckout
      ? `Write ${SENSEI_AUDIT_RELATIVE_PATH} using the deliverable-readiness rubric (verdict, dimension scores, findings with file evidence).`
      : "Record the audit in your completion report, using the deliverable-readiness rubric: a verdict, a numeric score, and findings each anchored to a file path. Do not add files to this checkout — it is not the platform's, and a document nobody asked for is a change to it.",
    "Do not emit a stub JSON such as {\"status\":\"ready\"}.",
    input.sampledTitle
      ? `Sampled leaf AC re-run: "${input.sampledTitle}"${input.sampledCommand ? ` — run ${input.sampledCommand} and record stdout.` : "."}`
      : "Sample one completed leaf and re-run its acceptance commands.",
    "If the gate fails, reopen affected tasks; do not advance to the next track.",
  ].join(" ");
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
    description: auditLeafDescription({
      phaseTitle: phase.title,
      projectSlug: project?.slug,
      sampledTitle: sampled?.title,
      sampledCommand: sampledChecks.length > 0 ? sampledCommand : undefined,
    }),
    status: "todo",
    priority: 0,
    sortOrder: maxSort + 10,
    // The audit writes its own artifact; the phase's freezes are not the auditor's to bypass, and the audit
    // leaf's own text declares none.
    frozenPaths: [],
    assigneeAgentId: auditorId,
    acceptanceCriteria: auditAcceptanceCriteria(project?.slug, checkCriterion),
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

import { existsSync, statSync } from "node:fs";

/**
 * Reconciles what an agent's reply *claims* against what durably happened.
 *
 * Why this exists: on the capability probe a turn with **zero tool calls** reported, in a structured
 * table, that a project had been created, a repository linked and a team of six created — every one of
 * those absent from disk — and closed by asking for approval. Nothing in the platform contradicted it;
 * only an operator running `projects list` and `agents tree` by hand would have noticed.
 *
 * That is the same defect shape the platform's evidence gates exist to prevent, one level up: an
 * artifact that satisfies the letter of a criterion while proving nothing. Here the artifact is the
 * reply. So the reply is checked, not trusted.
 *
 * Scope, stated honestly: this is a **claim/state reconciliation for a small set of entity kinds**
 * (projects, agents, repositories linked), not a general fact-checker. It only reports what it can
 * compare against durable state, and it prefers silence to speculation — a false accusation against a
 * correct reply would be its own kind of dishonesty.
 */

export type ClaimSeverity = "high" | "medium";

export interface ClaimFinding {
  /** What the reply asserted. */
  claim: string;
  /** What durable state showed for that assertion. */
  evidence: string;
  /** `high` = the turn could not have produced this (e.g. no tool ran at all). */
  severity: ClaimSeverity;
}

export interface DurableSnapshot {
  projects: string[];
  agents: string[];
  /** `file://` repository paths reachable from the projects in the snapshot. */
  repositoryPaths: string[];
  workItems: number;
}

/** Minimal shape needed to snapshot; keeps this module independent of the store implementations. */
export interface ClaimAuditContext {
  listProjectSlugs(): string[];
  listGeneratedAgentSlugs(): string[];
  listProjectRepositoryUrls(): string[];
  countWorkItems(): number;
}

export function snapshotDurableState(ctx: ClaimAuditContext): DurableSnapshot {
  return {
    projects: [...ctx.listProjectSlugs()],
    agents: [...ctx.listGeneratedAgentSlugs()],
    repositoryPaths: [...ctx.listProjectRepositoryUrls()],
    workItems: ctx.countWorkItems(),
  };
}

function added(before: string[], after: string[]): string[] {
  const previous = new Set(before);
  return after.filter((item) => !previous.has(item));
}

function fileUrls(reply: string): string[] {
  const urls = new Set<string>();
  for (const match of reply.matchAll(/file:\/\/[^\s`"')\]]+/g)) {
    urls.add(match[0].replace(/[.,;:]$/, ""));
  }
  return [...urls];
}

/**
 * Word-order-independent claim detection.
 *
 * An earlier attempt matched a noun *before* a verb on the same line and missed the exact reply this
 * module exists to catch: a table row reading ``| `voice-language-trainer` | Creado (`create_project`)…|``
 * states the entity first and the verb second, and a prose line can invert them. Rather than encode
 * grammar, the audit anchors on the **named entity**: if the reply asserts creation and names a slug
 * that exists nowhere, that is the finding. It is more precise than matching sentence shapes and it
 * does not depend on the reply's language.
 */
const CREATION_VERB = /\b(?:cread[oa]s?|created|crear[eé]|creé|sembrad[oa]?s?|seeded)/i;
const LINK_VERB = /\b(?:vinculad[oa]?s?|linked|sembrad[oa]?s?|seeded)/i;
const PERSIST_VERB = /\b(?:persist\w*|guardad[oa]?s?|aplicad[oa]?s?|applied|saved)/i;

/**
 * A slug a reply can name: lowercase words joined by hyphens. Deliberately excludes snake_case, which
 * is this platform's tool-name convention (`create_project` must not read as a claimed entity) and bare
 * single words like a status (`planning`) or a filesystem segment (`projects`).
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

function slugs(reply: string): string[] {
  const found = new Set<string>();
  for (const match of reply.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)+/g)) {
    if (match[0].length >= 5 && SLUG.test(match[0])) found.add(match[0]);
  }
  return [...found];
}

/**
 * Compares a reply against the durable state captured around its own turn.
 *
 * `toolsUsed` empty is the strongest available signal: a turn that executed no tool cannot have
 * created anything, whatever it says.
 */
export function auditTurnClaims(input: {
  reply: string;
  before: DurableSnapshot;
  after: DurableSnapshot;
  toolsUsed: string[];
}): ClaimFinding[] {
  const { reply, before, after, toolsUsed } = input;
  const findings: ClaimFinding[] = [];
  const noTools = toolsUsed.length === 0;
  const newProjects = added(before.projects, after.projects);
  const newAgents = added(before.agents, after.agents);
  const known = new Set([...after.projects, ...after.agents]);

  // 1. Named entities. The strongest check: the reply names a slug and asserts creation, but nothing
  //    with that name exists anywhere. This is what caught the reconstructed table reply.
  if (CREATION_VERB.test(reply)) {
    const unknown = slugs(reply).filter((name) => !known.has(name));
    for (const name of unknown) {
      findings.push({
        claim: `claims "${name}" was created`,
        evidence: noTools
          ? `no tool was executed this turn, and no project or agent named "${name}" exists (known: ${[...known].join(", ") || "none"})`
          : `no project or agent named "${name}" exists (known: ${[...known].join(", ") || "none"})`,
        severity: noTools ? "high" : "medium",
      });
    }
  }

  // 2. Creation asserted with nothing created at all, even without naming an entity.
  if (CREATION_VERB.test(reply) && newProjects.length === 0 && newAgents.length === 0) {
    const existing = [...known].join(", ") || "none";
    findings.push({
      claim: "claims work was created",
      evidence: noTools
        ? `no tool was executed this turn, so nothing could have been created (known: ${existing})`
        : `no project or agent was created this turn (known: ${existing})`,
      severity: noTools ? "high" : "medium",
    });
  }

  // 3. A claimed headcount above what was actually created.
  // `6-roles` and `6 roles` are the same claim.
  const claimedCount = reply.match(/(\d+)[\s-]*(?:roles|miembros|agents|agentes)/i);
  if (claimedCount && Number(claimedCount[1]) > newAgents.length) {
    findings.push({
      claim: `claims ${claimedCount[1]} roles were created`,
      evidence: `${newAgents.length} agent(s) were created this turn${
        newAgents.length ? `: ${newAgents.join(", ")}` : ""
      }`,
      severity: "medium",
    });
  }

  // 4. A linked repository whose path does not exist. Checked on disk, not against the store: a path
  //    can be stored and still be meaningless.
  if (LINK_VERB.test(reply)) {
    const urls = fileUrls(reply);
    const missing = urls.filter((url) => {
      const path = url.slice("file://".length);
      return !existsSync(path) || !statSync(path).isDirectory();
    });
    if (missing.length > 0) {
      findings.push({
        claim: "claims a repository was linked",
        evidence: `path(s) do not exist on disk: ${missing.join(", ")}`,
        severity: "high",
      });
    } else if (urls.length === 0 && after.repositoryPaths.length === before.repositoryPaths.length) {
      findings.push({
        claim: "claims a repository was linked",
        evidence: "no repository path is present in durable state for any project",
        severity: noTools ? "high" : "medium",
      });
    }
  }

  // 5. A plan claimed as persisted while no work item appeared.
  if (PERSIST_VERB.test(reply) && after.workItems <= before.workItems) {
    findings.push({
      claim: "claims a plan was persisted or applied",
      evidence: `work item count did not increase (${before.workItems} → ${after.workItems})`,
      severity: noTools ? "high" : "medium",
    });
  }

  return findings;
}

/** One-line rendering used by the CLI and by API consumers that only want a string. */
export function formatClaimWarning(finding: ClaimFinding): string {
  return `[unverified claim ${finding.severity}] it ${finding.claim}, but ${finding.evidence}`;
}

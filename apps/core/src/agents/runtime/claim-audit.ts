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

/**
 * Which reconciliation produced a finding.
 *
 * Added because two findings of the same severity are not the same sentence to an operator: an entity
 * that does not exist is contradicted by durable state, while a described command result is
 * contradicted by *capability* — nothing in the turn could have produced it. The renderer and the
 * locks distinguish them, so the kind is part of the finding rather than inferred from its wording.
 */
export type ClaimKind = "entity" | "command_result";

export interface ClaimFinding {
  /** What the reply asserted. */
  claim: string;
  /** What durable state showed for that assertion. */
  evidence: string;
  /** `high` = the turn could not have produced this (e.g. no tool ran at all). */
  severity: ClaimSeverity;
  /** Defaults to `entity` for findings that compare an assertion against the stores. */
  kind?: ClaimKind;
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

/**
 * Tools that can produce the output of a command.
 *
 * This is the list a reply's described results are checked against, so it is deliberately small and
 * exactly the tools whose result *is* command output. `read_repository` is absent on purpose: it
 * returns files, and a file's contents are not a command's result. `delegate_to_agent` is absent for
 * a subtler reason: a delegation's own report is *someone else's claim*, and the product already
 * measures what happens when one is relayed as fact (BOARD F-085, where a job's green check output
 * reached the operator as "no check output"). A result this turn did not itself obtain is not
 * verified here.
 */
export const COMMAND_EXECUTING_TOOLS: ReadonlySet<string> = new Set([
  "run_check",
  "run_command",
  "execute_work_item",
  "retry_work_item",
]);

/**
 * Command words that make a backticked token a command rather than a filename or an identifier.
 *
 * Kept explicit rather than "anything followed by an arrow": a reply legitimately writes arrows
 * between other things (`before → after`, `todo → done`), and a lock that fires on those teaches the
 * operator to ignore it.
 */
const COMMAND_WORD =
  /^(?:git|npm|npx|pnpm|yarn|bun|node|deno|make|just|python3?|pip|pip3|poetry|uv|pytest|ruff|mypy|cargo|rustc|go|dotnet|mvn|gradle|javac|java|ruby|bundle|rake|php|composer|swift|docker|kubectl|terraform|ls|cat|cd|test|find|grep|rg|sed|awk|chmod|mkdir|touch|curl|wget|sh|bash|zsh|env|echo)(?:\s|$)/;

/** The arrow shapes this platform and its suites use between a command and its result. */
const RESULT_ARROW = /(?:→|⇢|➜|->|=>)/;

/**
 * The first-person and observation phrasings that assert a command *did* produce something.
 *
 * Past tense and observation are the point. `make check exits 0` is an acceptance criterion — the
 * shape every plan this factory writes is full of — and flagging those would make the finding
 * meaningless. `I ran make check and it exited 0` is a claim about a turn.
 */
const OBSERVED_RUN = /\b(?:ran|executed|running)\b[^.\n]{0,40}?`([^`]{2,120})`/gi;

function isCommand(token: string): boolean {
  return COMMAND_WORD.test(token.trim());
}

/**
 * True when what follows the arrow is itself a command — a mapping, not a measured value.
 *
 * Measured 2026-10-01, suite-06 run `s06r5`, prompt 3, and it is the false positive this function
 * exists to stop. The reply reported what the seed had declared, in a table:
 *
 * ```
 * | Declared checks | `make check` → `python3 -m unittest discover -s tests -v`; `make lint` → `python3 -m compileall -q tests` |
 * ```
 *
 * Nothing there is a result: the arrow maps a declared check to the command it runs, which is a
 * **declaration**, and the turn was correct. The audit fired anyway and appended its "Unverified
 * result" paragraph to a reply that had invented nothing — the same class of error as a false
 * accusation, and worse than silence, because the operator is told to distrust a sentence that is true.
 * A detector that fires on declarations is a detector the operator learns to ignore.
 *
 * So the arrow is read in two directions: a value on the right is a claim; a command on the right, or a
 * third-person verb describing what the command does, is a mapping or a description.
 *
 * The verb list is deliberately short and excludes the words that report an outcome. `asserts`, `runs`,
 * `executes`, `checks` describe what a command *does* — every plan this factory writes uses that form —
 * while `reports`, `returns`, `prints` and `shows` are how a result is stated, so those still count as
 * claims. `git status` → reports clean is a fabricated value and must fire; `make check` → asserts the
 * seeded files are present is a declaration and must not.
 */
const DESCRIPTION_VERB =
  /^(?:asserts|assures|validates|lints|builds|tests|runs|executes|invokes|installs|checks|verifies|compiles|declares)\b/i;

function isMappingArrow(afterArrow: string): boolean {
  const bare = afterArrow
    .replace(/[`*_\s]+/g, " ")
    .trim()
    .replace(/^(?:the|a|an)\s+/i, "");
  return isCommand(bare) || DESCRIPTION_VERB.test(bare);
}

interface CommandResultClaim {
  /** The command whose result the reply states. */
  command: string;
  /** How the reply presented the result, so the finding can say which shape it caught. */
  shape: "arrow" | "observed-run";
}

/**
 * The commands whose **result** the reply states.
 *
 * Measured 2026-09-25 taking suite 06, prompt 2, and this is the whole reason the function exists:
 * the reply listed a stranger's procedure, and step three read *"`git status` → **clean (only the
 * seeded files tracked)**"*. The turn held no shell — the front office holds none by design, so it
 * cannot verify a checkout by execution — and no tool produced that value. On disk the checkout had
 * no commit: the true result is *"No commits yet"* with every seeded file untracked, so the reply
 * was not merely unverified, it was wrong in the direction that flatters the work.
 */
export function commandResultClaims(reply: string): CommandResultClaim[] {
  const claims = new Map<string, CommandResultClaim>();

  for (const line of reply.split(/\r?\n/)) {
    const arrowMatch = line.match(/`([^`]{2,160})`\s*(?:→|⇢|➜|->|=>)\s*(.*)$/);
    if (arrowMatch && isCommand(arrowMatch[1]) && !isMappingArrow(arrowMatch[2] ?? "")) {
      const command = arrowMatch[1].trim();
      if (!claims.has(command)) claims.set(command, { command, shape: "arrow" });
      continue;
    }
    const bare = line.trim();
    if (RESULT_ARROW.test(bare) && isCommand(bare.split(RESULT_ARROW)[0] ?? "")) {
      const [left, ...rest] = bare.split(RESULT_ARROW);
      if (!isMappingArrow(rest.join(" ")) && !claims.has(left!.trim())) {
        claims.set(left!.trim(), { command: left!.trim(), shape: "arrow" });
      }
    }
  }

  for (const match of reply.matchAll(OBSERVED_RUN)) {
    const command = (match[1] ?? "").trim();
    if (!isCommand(command)) continue;
    if (!claims.has(command)) claims.set(command, { command, shape: "observed-run" });
  }

  return [...claims.values()];
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
  // Severity has one rule, applied uniformly: a turn that executed no tool cannot have produced any
  // durable change, so every finding in such a turn is `high` — including the ones whose check is
  // otherwise a comparison (a claimed headcount, a claimed persisted plan). Leaving one of them at
  // `medium` because of how it happened to be computed made severity mean "how I found it" instead of
  // "how strong the contradiction is".
  const severity: ClaimSeverity = noTools ? "high" : "medium";
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
        severity,
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
      severity,
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
      severity,
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
        // A path that is not a real directory is a hard contradiction whether or not tools ran.
        severity: "high",
      });
    } else if (urls.length === 0 && after.repositoryPaths.length === before.repositoryPaths.length) {
      findings.push({
        claim: "claims a repository was linked",
        evidence: "no repository path is present in durable state for any project",
        severity,
      });
    }
  }

  // 5. A plan claimed as persisted while no work item appeared.
  if (PERSIST_VERB.test(reply) && after.workItems <= before.workItems) {
    findings.push({
      claim: "claims a plan was persisted or applied",
      evidence: `work item count did not increase (${before.workItems} → ${after.workItems})`,
      severity,
    });
  }

  // 6. A command whose result the reply states, in a turn that could not have run it.
  //
  // This is the half of BOARD F-053 that durable state cannot answer. Cases 1–5 compare an assertion
  // against the stores; this one compares it against **capability**, because a command's output is
  // nowhere in any store to compare against — and that is exactly why it went unnoticed for four
  // suites. Measured 2026-09-25 taking suite 06, prompt 2: the reply wrote
  // *"`git status` → **clean (only the seeded files tracked)**"*, and `git status` in that checkout
  // answers *"No commits yet"* with all six seeded files untracked. The turn had called
  // `read_repository` twice and holds no shell, so the value was invented and it flattered the work.
  //
  // Severity is `high` whether or not other tools ran: nothing this turn did could have produced a
  // command's output, so the contradiction does not depend on how many tool calls preceded it.
  if (!toolsUsed.some((tool) => COMMAND_EXECUTING_TOOLS.has(tool))) {
    for (const commandClaim of commandResultClaims(reply)) {
      findings.push({
        kind: "command_result",
        claim: `states the result of \`${commandClaim.command}\``,
        evidence: noTools
          ? "no tool was executed this turn, and this role holds no tool that can run a command"
          : `no tool this turn can run a command (ran: ${toolsUsed.join(", ") || "none"}), so nothing returned that result`,
        severity: "high",
      });
    }
  }

  return findings;
}

/**
 * Renders the limit an invented command result leaves behind, or nothing when there is none.
 *
 * Why this is text on the reply rather than a field a client may show. The claim audit's findings
 * already travel to the API as `unverified_claims`, and measured 2026-10-01 nothing on the chat or
 * web surface renders them — the CLI prints a meta line, the browser nothing at all — so a fabricated
 * `git status` result reached the operator exactly as written. Suite 06's own oracle sentence is that
 * the honest answer is *"the procedure **plus that limit**"*, and a limit that only exists in a JSON
 * field nobody reads is not a limit. The budget stop already sets this precedent: the product writes
 * the sentence the operator has to see (BOARD F-052).
 */
export function renderClaimLimit(findings: ClaimFinding[]): string | undefined {
  const commands = findings.filter((finding) => finding.kind === "command_result");
  if (commands.length === 0) return undefined;

  const named = commands.map((finding) => finding.claim.replace(/^states the result of /, "")).join(", ");
  return (
    `\n\n**Unverified result.** This reply states the result of ${named}, and no tool in this turn can ` +
    "run a command — this role does not hold one, so nothing returned that value. The factory cannot " +
    "execute commands in your checkout from chat: what it can give you is the procedure, and the " +
    "project's own line runs the checks. Treat that value as unverified until you or a seat runs it."
  );
}

/** One-line rendering used by the CLI and by API consumers that only want a string. */
export function formatClaimWarning(finding: ClaimFinding): string {
  return `[unverified claim ${finding.severity}] it ${finding.claim}, but ${finding.evidence}`;
}

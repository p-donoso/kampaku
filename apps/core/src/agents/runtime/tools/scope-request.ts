import { readdirSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { KampakuToolContext } from "./index.js";
import type { Store } from "../../../persistence/store.js";
import {
  classifyExpansions,
  describeBlastRadius,
  describeCost,
  PLATFORM_REWRITE_REFUSAL,
  type ExpansionDomain,
} from "../../../application/pm/scope-request.js";
import type { ScopeRequestRecord } from "../../../persistence/scope-request-store.js";

/**
 * @module tools/scope-request
 *
 * The two operations a scope expansion needs, and nothing else: **request** it (as one row per domain,
 * with its price in paths) and **decide** it (one row at a time).
 *
 * Why a tool and not a question. Measured 2026-10-21 on suite 12's first run (`s12r1`): four expansions
 * arrived, the front office stopped, and the only durable object it could raise was a `<kampaku-question>`
 * whose options bundled them. The next turn could not read the asks back — its own words: *"The four asks
 * are not retrievable from any store either of us can read"* — so the follow-up prompt that asks for a
 * blast-radius list could only be answered by asking the emperor to repeat himself. A request the
 * operator answers must be an object with an id, a scope and a price, not a sentence in a transcript.
 */

/** Directories that are never a project's own content, and are skipped when pricing a refactor. */
const NOT_PROJECT_CONTENT = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "dist",
  "build",
  "target",
  "coverage",
  ".turbo",
]);

/** The checkout a project's work lives in, as a path, when a `file://` link states one. */
/**
 * The checkout a project's work lives in, as a path, when a link states one.
 *
 * Read by **id or slug**, because the caller passes the slug the operator used and `getProject` resolves ids
 * only — the first version of this function looked up by id, silently priced nothing, and every blast radius
 * came back checkout-relative (`src/payments/` instead of `<checkout>/src/payments/`). A path that cannot be
 * checked against disk is the generic warning this suite's oracle rejects, so the lookup is by whichever form
 * the request named.
 */
function primaryCheckoutPath(store: Store, projectSlug: string): string | undefined {
  const project = store.getProjectByIdOrSlug(projectSlug);
  const primary = project?.repositories?.[0];
  if (!primary) return undefined;
  const url = primary.url;
  if (url.startsWith("file://")) {
    try {
      return fileURLToPath(url);
    } catch {
      return undefined;
    }
  }
  return isAbsolute(url) ? url : undefined;
}

/** The checkout's own top level, read rather than guessed. Absent or unreadable means "nothing read". */
function readTopLevel(checkoutPath: string | undefined): string[] {
  if (!checkoutPath) return [];
  try {
    return readdirSync(checkoutPath, { withFileTypes: true })
      .filter((entry) => !NOT_PROJECT_CONTENT.has(entry.name))
      .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      .sort()
      .slice(0, 24);
  } catch {
    return [];
  }
}

export interface RequestScopeExpansionArgs {
  project_slug: string;
  /** The operator's request, as they wrote it. Split into one request per expansion. */
  request: string;
  /** Optional per-domain wording, when the caller wants the summary to say something sharper. */
  summaries?: Partial<Record<ExpansionDomain, string>>;
}

export interface RequestScopeExpansionResult {
  projectSlug: string;
  /** One entry per expansion: its row, and whether the row was already open. */
  requests: Array<{
    id: string;
    domain: ExpansionDomain;
    summary: string;
    status: string;
    blastRadius: string[];
    cost: string;
    alreadyOpen: boolean;
  }>;
  refused: Array<{ domain: ExpansionDomain; statement: string; id?: string }>;
  message: string;
}

export function executeRequestScopeExpansion(
  ctx: KampakuToolContext,
  args: RequestScopeExpansionArgs,
  scope?: { agentId?: string; conversationId?: string },
): RequestScopeExpansionResult {
  const store = ctx.scopeRequestStore;
  if (!store) throw new Error("Scope requests are not available in this runtime.");

  const projectSlug = args.project_slug?.trim();
  if (!projectSlug) {
    throw new Error(
      "A scope expansion must name the project it expands: \"this project\" has no referent in a " +
        "conversation, and a request against the wrong container cannot be answered.",
    );
  }
  const project = ctx.store.getProjectByIdOrSlug(projectSlug);
  if (!project) throw new Error(`Project "${projectSlug}" not found.`);

  const request = args.request?.trim();
  if (!request) throw new Error("The request is required: state what the operator asked for.");

  const checkout = primaryCheckoutPath(ctx.store, projectSlug);
  const existingTopLevel = readTopLevel(checkout);

  const expansions = classifyExpansions(request);
  const requests: RequestScopeExpansionResult["requests"] = [];
  const refused: RequestScopeExpansionResult["refused"] = [];

  for (const expansion of expansions) {
    const summary = args.summaries?.[expansion.domain]?.trim() || expansion.summary;
    const blastRadius = describeBlastRadius({
      domain: expansion.domain,
      checkoutRoot: checkout,
      existingTopLevel,
    });
    const cost = describeCost(expansion.domain);

    if (expansion.domain === "platform_rewrite") {
      const { record } = store.request({
        projectSlug,
        request,
        domain: expansion.domain,
        summary,
        blastRadius,
        cost,
        requestedByAgentId: scope?.agentId,
        conversationId: scope?.conversationId,
        status: "refused",
        decision: PLATFORM_REWRITE_REFUSAL,
      });
      refused.push({ domain: expansion.domain, statement: PLATFORM_REWRITE_REFUSAL, id: record.id });
      continue;
    }

    const { record, alreadyOpen } = store.request({
      projectSlug,
      request,
      domain: expansion.domain,
      summary,
      blastRadius,
      cost,
      requestedByAgentId: scope?.agentId,
      conversationId: scope?.conversationId,
      status: "pending",
    });
    requests.push({
      id: record.id,
      domain: record.domain,
      summary: record.summary,
      status: record.status,
      blastRadius: record.blastRadius,
      cost: record.cost ?? cost,
      alreadyOpen,
    });
  }

  const parts: string[] = [];
  parts.push(
    `${requests.length} expansion${requests.length === 1 ? "" : "s"} parked as separately approvable ` +
      `request${requests.length === 1 ? "" : "s"} on ${projectSlug}. No work item, job or repository write ` +
      "was created: nothing executes until the emperor approves a specific request id.",
  );
  if (refused.length > 0) {
    parts.push(`Refused outright: ${refused.map((entry) => entry.domain).join(", ")}. ${PLATFORM_REWRITE_REFUSAL}`);
  }

  return { projectSlug, requests, refused, message: parts.join(" ") };
}

export interface DecideScopeExpansionArgs {
  request_id: string;
  approve: boolean;
  /** The operator's answer, when there is one. Omitted means "Approved." / "Rejected.". */
  decision?: string;
}

/**
 * Answers one request. Not a tool: this is the operator's act, reachable from the CLI and the web UI,
 * and deliberately absent from every agent's toolset — an agent that could approve its own expansion
 * would make the approval decorative.
 */
export function decideScopeExpansion(
  store: { decide: (id: string, input: { approve: boolean; decision?: string }) => ScopeRequestRecord },
  args: DecideScopeExpansionArgs,
): ScopeRequestRecord {
  if (!args.request_id?.trim()) throw new Error("A request id is required: one decision answers one request.");
  return store.decide(args.request_id.trim(), { approve: args.approve, decision: args.decision });
}

export const REQUEST_SCOPE_EXPANSION_TOOL = {
  type: "function" as const,
  function: {
    name: "request_scope_expansion",
    description:
      "Park an expansion the operator asked for as separately approvable requests instead of planning it. " +
      "Use this the moment a request would expand the work order beyond what it was opened for — a new " +
      "product surface, new payments or authentication, a second deliverable, a refactor of an existing " +
      "layer. The request is split into one row per expansion, each with its own id, its blast radius in " +
      "paths, and its cost, and no work item or job is created. The emperor approves or rejects one row at " +
      "a time. Never park an expansion as a question, and never answer a request about rewriting the " +
      "platform's own core: that is refused here, not offered as an option.",
    parameters: {
      type: "object",
      properties: {
        project_slug: { type: "string", description: "The project the expansion would change." },
        request: {
          type: "string",
          description:
            "The operator's request as they wrote it. It is split on clauses, one request per expansion.",
        },
        summaries: {
          type: "object",
          description:
            "Optional per-domain wording, so each row says what would change rather than quoting a clause.",
          properties: {
            authentication: { type: "string" },
            payments: { type: "string" },
            mobile_app: { type: "string" },
            data_layer_refactor: { type: "string" },
            platform_rewrite: { type: "string" },
            other: { type: "string" },
          },
        },
      },
      required: ["project_slug", "request"],
    },
  },
};

import type { MiddlewareHandler } from "hono";

/**
 * The request-body contract of every mutating route: the field names it reads, and the one place they are
 * checked.
 *
 * Measured 2026-10-04 on `POST /api/v1/projects` (BOARD F-101, run `s08r12`). The route read a plain
 * `c.req.json<{...}>()` with no schema, so any field it did not know was dropped and the answer was still
 * **201**:
 *
 * ```text
 * POST /api/v1/projects  {"slug":"probe-camel","name":"probe camel","projectLeadAgentId":"<lead-id>"}
 *   -> 201   projectLeadAgentId: null      <- accepted, ignored, never mentioned
 * POST /api/v1/projects  {"slug":"probe-nonsense","name":"...","totally_unknown_field":"x"}
 *   -> 201   no owner                      <- likewise
 * ```
 *
 * The cost was not local: the container had no accountable lead, the front office **cannot** plan a work
 * order nobody owns and holds no tool that attaches one — correctly — so the run spent a turn on an honest
 * refusal and the operator repaired it out of band with `kampaku projects update <slug> --lead <slug> --yes`.
 * `projectLeadAgentId` is the *read* shape of the field; the route writes `project_lead_slug`. A caller that
 * mirrored the read shape into the write shape got silence.
 *
 * The rule this implements, and the same one closure evidence is held to everywhere else in this product:
 * **an input nothing validates is an input nobody can trust.** A body the route only partly understood is
 * refused, and the refusal names the fields the route does read, so the caller can act on it. `201` to a
 * request you ignored is the one answer that cannot.
 *
 * Two decisions worth stating:
 *
 * - **The registry lists every spelling the handler actually reads, aliases included** (`promptFragment`
 *   beside `prompt_fragment`, `confirmationReference` beside `confirmation_reference`, `keepLearnings`,
 *   `projectSlug`, ...). The rule is "what the handler reads", not "what a style guide prefers" — refusing a
 *   spelling the handler honours would break a working caller to fix nothing.
 * - **A mutating route that declares no fields at all is a registration error, not a pass.** `POST
 *   /api/v1/work-items/:id/execute` reads no body, so it declares none and any field on it is refused.
 *   Leaving such a route out of this table would leave the class standing on that route, and the
 *   exhaustiveness test in `apps/core/tests/api/request-body-fields.test.ts` fails if one is missing — so a
 *   new route cannot be added without deciding, in the same commit, whether it reads a body.
 */

/** The field names a route's handler reads from a JSON body. Empty means "reads none". */
export type BodyFields = readonly string[];

/**
 * The confirmation fields, in both spellings.
 *
 * `readDestructiveConfirmation` accepts snake_case and camelCase in the body as well as in the query
 * string, so both are read fields and both belong in the table below. `confirmation_reference` looked up
 * only under its camelCase twin would be a working caller refused.
 */
const CONFIRMATION_FIELDS: BodyFields = [
  "confirmation_reference",
  "confirmation_token",
  "confirmed_by",
  "confirmationReference",
  "confirmationToken",
  "confirmedBy",
];

/**
 * Every mutating `/api/v1` route, keyed `"<METHOD> <route pattern>"`.
 *
 * The key is the pattern Hono itself registers, so this table and the router cannot disagree about which
 * route is which.
 */
export const REQUEST_BODY_FIELDS: Readonly<Record<string, BodyFields>> = {
  // --- projects ---------------------------------------------------------------------------------
  // The route every suite opens its work order through, and the one F-101 was measured on. `id` was
  // already read; `status` is deliberately absent — it is a `PATCH` field (creating a container in a
  // terminal state is not a creation), and a caller that names it is told so instead of being answered 201.
  "POST /api/v1/projects": [
    "id",
    "slug",
    "name",
    "description",
    "repositories",
    "createdAt",
    "project_lead_slug",
    "stack",
  ],
  "PATCH /api/v1/projects/:idOrSlug": [
    "name",
    "description",
    "status",
    "project_lead_slug",
    "coherence_strategy",
    "repositories",
    "allow_workspace_repository",
    "allow_missing_path",
    "wikiSyncRequired",
    "wikiSyncPageSlug",
    "wikiSyncPhasePages",
    ...CONFIRMATION_FIELDS,
  ],
  "DELETE /api/v1/projects/:idOrSlug": [...CONFIRMATION_FIELDS],
  "POST /api/v1/projects/:idOrSlug/play": [],
  "POST /api/v1/projects/:idOrSlug/pause": [],
  "POST /api/v1/projects/:idOrSlug/step": [],
  "POST /api/v1/projects/:projectId/work-items": [
    "title",
    "description",
    "parent_id",
    "status",
    "priority",
    "sort_order",
    "assignee_agent_id",
    "acceptance_criteria",
    "frozen_paths",
  ],
  "PATCH /api/v1/project-documents/:id": ["title", "content_md"],
  "POST /api/v1/projects/:idOrSlug/wiki/pages": [
    "slug",
    "title",
    "content_md",
    "parent_id",
    "parent_slug",
  ],
  "POST /api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/propose": [
    "agent_slug",
    "title",
    "content_md",
  ],
  "POST /api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/approve": ["agent_slug"],
  "POST /api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/reject": ["agent_slug"],
  "POST /api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/comments": [
    "content",
    "agent_slug",
    "author_name",
    "parent_comment_id",
  ],

  // --- agents and conversations -----------------------------------------------------------------
  "POST /api/v1/agents": [
    "slug",
    "name",
    "responsibilities",
    "system_prompt",
    "parent_slug",
    "skill_slugs",
  ],
  "PATCH /api/v1/agents/:slugOrId": ["name", "responsibilities", "system_prompt", "parent_slug"],
  "DELETE /api/v1/agents/:slugOrId": [...CONFIRMATION_FIELDS],
  "POST /api/v1/agents/:slugOrId/memories": [
    "kind",
    "title",
    "body",
    "summary",
    "relevance",
    "project_id",
    "conversation_id",
    "work_item_id",
    "metadata",
  ],
  "POST /api/v1/agents/kampaku/chat": ["message", "conversation_id", "project_id"],
  "POST /api/v1/agents/kampaku/chat/stream": ["message", "conversation_id", "project_id"],
  "PATCH /api/v1/conversations/:id": ["title"],
  "DELETE /api/v1/conversations/:id": [],

  // --- planning and execution -------------------------------------------------------------------
  "POST /api/v1/intents": [
    "intent",
    "projectSlug",
    "createMissingAgents",
    "granularity",
    "mode",
    "approvalReference",
    "approvalFingerprint",
    "approvalContentHash",
  ],
  "POST /api/v1/plans/approve": [
    "agent_slug",
    "project_slug",
    "approval_reference",
    "plan_fingerprint",
    "plan_content_hash",
    "expires_at",
  ],
  "POST /api/v1/plans/revoke": [
    "agent_slug",
    "project_slug",
    "approval_reference",
    "plan_fingerprint",
    "plan_content_hash",
  ],
  "PATCH /api/v1/work-items/:id": [
    "title",
    "description",
    "status",
    "priority",
    "sort_order",
    "parent_id",
    "assignee_agent_id",
    "done_override",
  ],
  "DELETE /api/v1/work-items/:id": [],
  "POST /api/v1/work-items/:id/execute": [],
  "POST /api/v1/work-items/:id/retry": [],
  // The operator re-runs the item's own stated checks. `by` is who ran it; `notes` is accepted so a caller can
  // record why, and neither changes what runs — the item's criteria and the repository's declarations do.
  "POST /api/v1/work-items/:id/verification": ["by", "notes"],
  "POST /api/v1/work-items/:id/closure": [
    "decision",
    "criterion_id",
    "outcome",
    "by",
    "notes",
  ],
  "POST /api/v1/work-items/:id/release": ["by", "notes"],
  "POST /api/v1/post-action-reviews/:reviewId/retry": ["projection"],
  "POST /api/v1/goals": ["projectId", "objective", "priority", "repositoryRole"],
  // One decision, one request (suite 12). `approve` is the decision and `decision` is the operator's words;
  // nothing else is accepted, because a body that could carry a second id would be a bulk approval.
  "POST /api/v1/scope-requests/:id/decide": ["approve", "decision"],

  // --- questions, blockers and risks ------------------------------------------------------------
  "POST /api/v1/questions/:id/answer": ["answer", "answered_by_agent_id"],
  "POST /api/v1/questions/:id/escalate": ["by_agent_id"],
  "POST /api/v1/blockers/:id/resolve": ["resolution", "resolved_by_agent_id"],
  "POST /api/v1/blockers/:id/escalate": ["by_agent_id"],
  "POST /api/v1/blockers/:id/convert-to-question": ["by_agent_id"],
  "POST /api/v1/blockers/:id/delegate": [
    "by_agent_id",
    "title",
    "assignee_agent_id",
    "description",
    "parent_id",
  ],
  "POST /api/v1/risks/:riskId/disposition": [
    "action",
    "outcome",
    "accepted_by",
    "by_agent_id",
  ],

  // --- workers and jobs -------------------------------------------------------------------------
  "POST /api/v1/workers": [
    "id",
    "name",
    "version",
    "capabilities",
    "contractVersion",
    "registeredAt",
  ],
  // The worker's heartbeat: no body, and the protocol is the point — a lease is a lease.
  "POST /api/v1/workers/:workerId/jobs:lease": [],
  "POST /api/v1/jobs/:jobId/progress": ["leaseId", "line", "lines"],
  "PUT /api/v1/jobs/:jobId/result": ["leaseId", "status", "output", "error", "finishedAt"],
  "POST /api/v1/jobs/:jobId/pause": [],
  "POST /api/v1/jobs/:jobId/resume": [],
  "POST /api/v1/jobs/:jobId/cancel": [],

  // --- settings, skills and wiki ----------------------------------------------------------------
  // `saveModelProviderSettings` reads `provider`, `baseUrl`, `apiKey`, `model` and `clearApiKey`; the
  // `protocol` and `contextTokens` in the read shape are derived, not accepted, so naming them is refused.
  "PUT /api/v1/settings/model-provider": [
    "provider",
    "baseUrl",
    "apiKey",
    "model",
    "clearApiKey",
  ],
  "PUT /api/v1/settings/global-system-prompt": ["prompt"],
  "POST /api/v1/settings/reset-bootstrap": ["keepLearnings"],
  "POST /api/v1/settings/reset-all": [],
  "POST /api/v1/settings/filesystem/folders": ["path", "label", "readOnly"],
  "PATCH /api/v1/settings/filesystem/folders/:folderId": ["label", "readOnly"],
  "DELETE /api/v1/settings/filesystem/folders/:folderId": [],
  // `project` (and its two tolerated spellings) authors the skill for **that project alone** instead of
  // writing a seed into the platform's catalog (BOARD F-022). The route reads all three spellings, so
  // all three are declared: refusing a spelling the handler honours would break a working caller.
  "POST /api/v1/skills": [
    "slug",
    "name",
    "description",
    "capabilities",
    "tools",
    "prompt_fragment",
    "promptFragment",
    "default",
    "project",
    "project_slug",
    "projectSlug",
  ],
  "PATCH /api/v1/skills/:slug": [
    "slug",
    "name",
    "description",
    "capabilities",
    "tools",
    "prompt_fragment",
    "promptFragment",
    "default",
  ],
  "DELETE /api/v1/skills/:slug": [],
  "PATCH /api/v1/wiki-pages/:id": ["title", "content_md", "parent_id", "sort_order"],
};

/** The one answer a partly-understood request gets: refused, with the reason and the accepted set. */
export class UnknownBodyFieldError extends Error {
  readonly code = "UNKNOWN_FIELD";

  constructor(
    readonly method: string,
    readonly path: string,
    readonly unknownFields: readonly string[],
    readonly acceptedFields: BodyFields,
    readonly suggestions: Readonly<Record<string, string>>,
  ) {
    const named = unknownFields.map((field) => `"${field}"`).join(", ");
    const hints = Object.entries(suggestions)
      .map(([from, to]) => `Did you mean "${to}" instead of "${from}"?`)
      .join(" ");
    super(
      `${method} ${path} does not read ${named}. The request was refused before anything was done. ` +
        `It accepts: ${acceptedFields.join(", ")}${acceptedFields.length ? "" : " (no body fields)"}. ${hints}`.trim(),
    );
    this.name = "UnknownBodyFieldError";
  }
}

/** A body that is not a JSON object at all. The old answer was a bare 500 from the handler's own `json()`. */
export class InvalidBodyError extends Error {
  readonly code = "INVALID_BODY";

  constructor(
    readonly method: string,
    readonly path: string,
    readonly detail: string,
  ) {
    super(`${method} ${path} expects a JSON object body: ${detail}`);
    this.name = "InvalidBodyError";
  }
}

/**
 * A mutating route that reads a body and declares no fields.
 *
 * This is a **registration error**, and it answers 500 rather than guessing: the exhaustiveness test in
 * `apps/core/tests/api/request-body-fields.test.ts` fails the build for it, so it should be unreachable —
 * and a route that reaches it must not be answered as though its body had been understood.
 */
export class UndeclaredBodyRouteError extends Error {
  readonly code = "UNVALIDATED_BODY";

  constructor(
    readonly method: string,
    readonly path: string,
  ) {
    super(
      `${method} ${path} reads a request body but declares no fields, so this request cannot be checked ` +
        `and was not applied. Add the route to REQUEST_BODY_FIELDS (apps/core/src/api/request-body.ts).`,
    );
    this.name = "UndeclaredBodyRouteError";
  }
}

/** A trailing slash is the same route; the registry is keyed the way the router writes it. */
function normalisePath(path: string): string {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
  return trimmed === "" ? "/" : trimmed;
}

/** The declared fields for a method and a route pattern, or `undefined` when the route is not declared. */
export function bodyFieldsFor(method: string, path: string): BodyFields | undefined {
  return REQUEST_BODY_FIELDS[`${method.toUpperCase()} ${normalisePath(path)}`];
}

/**
 * The fields a handler reads, judged against the fields the request sent.
 *
 * Pure and separate from the middleware so the rule can be asserted without an HTTP round trip — and so the
 * same check could be applied to a second surface without a second implementation.
 */
export function checkBodyFields(method: string, path: string, body: unknown): void {
  const declared = bodyFieldsFor(method, path);
  if (declared === undefined) throw new UndeclaredBodyRouteError(method.toUpperCase(), path);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidBodyError(method.toUpperCase(), path, "the body is not a JSON object");
  }

  const unknown = Object.keys(body as Record<string, unknown>).filter(
    (field) => !declared.includes(field),
  );
  if (unknown.length === 0) return;

  const suggestions: Record<string, string> = {};
  for (const field of unknown) {
    const near = nearestDeclaredField(field, declared);
    if (near) suggestions[field] = near;
  }
  throw new UnknownBodyFieldError(method.toUpperCase(), path, unknown, declared, suggestions);
}

/**
 * The declared field a refused one was most likely meant to be, when one is close enough to name.
 *
 * Two spellings of one name share a **writing shape** (`projectLeadAgentId`, `project_lead_agent_id`, and
 * `Project-Lead-Agent-Id` all reduce to one string), and two names for one thing usually share the words
 * they are built from (`projectLeadAgentId` against this route's `project_lead_slug` shares *project* and
 * *lead* over four words — the case F-101 was measured on, where the caller mirrored the read shape into
 * the write shape). At least a third of the longer name's words must match, which is a **hint, not a
 * verdict**: the answer is the same 400 either way, and this only saves the caller a lookup.
 */
function nearestDeclaredField(field: string, declared: BodyFields): string | undefined {
  const shape = (name: string): string => name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const exactShape = declared.find((known) => shape(known) === shape(field));
  if (exactShape) return exactShape;

  const words = (name: string): string[] =>
    name
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => word.toLowerCase().replace(/s$/, ""));

  const wanted = words(field);
  let best: { name: string; score: number } | undefined;
  for (const known of declared) {
    const candidate = words(known);
    const shared = wanted.filter((word) => candidate.includes(word)).length;
    const score = shared / Math.max(wanted.length, candidate.length);
    if (score >= 1 / 3 && (best === undefined || score > best.score)) best = { name: known, score };
  }
  return best?.name;
}

/** What Hono knows about a route, as much as this module needs. */
export interface RegisteredRoute {
  readonly path: string;
  readonly method: string;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function patternMatches(pattern: string, path: string): boolean {
  const patternParts = normalisePath(pattern).split("/");
  const pathParts = normalisePath(path).split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every(
    (part, index) => part.startsWith(":") || part === pathParts[index],
  );
}

/** The registered route a request is aimed at, or `undefined` when nothing matches (a 404 in waiting). */
export function matchRegisteredRoute(
  routes: readonly RegisteredRoute[],
  method: string,
  path: string,
): RegisteredRoute | undefined {
  return routes.find(
    (route) => route.method.toUpperCase() === method.toUpperCase() && patternMatches(route.path, path),
  );
}

/**
 * The guard: it runs before every handler, and it is the only place a request body is judged.
 *
 * Four shapes reach a caller, and each one is actionable:
 *
 * | Request | Answer |
 * |---|---|
 * | a field the route does not read | **400** `UNKNOWN_FIELD`, naming it and the accepted set |
 * | a body that is not a JSON object | **400** `INVALID_BODY` (it used to be a bare 500) |
 * | a mutating route with no declared fields | **500** `UNVALIDATED_BODY` — a registration error, fail-closed |
 * | a path no route matches | nothing: this judges bodies, not addresses, so Hono's own 404 stands |
 * | a body the route does read | the handler runs, unchanged |
 *
 * The body is inspected through `c.req.raw.clone()`, so the handler still reads its own body as before, and
 * an empty body is not a body: a `POST` with `content-type: application/json` and nothing in it stays
 * whatever the route says it is.
 */
export function createBodyFieldGuard(routesFn: () => readonly RegisteredRoute[]): MiddlewareHandler {
  let index: readonly RegisteredRoute[] | undefined;
  const routes = (): readonly RegisteredRoute[] => (index ??= routesFn());

  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (MUTATING.has(method)) {
      const path = normalisePath(c.req.path);
      const route = matchRegisteredRoute(routes(), method, path);
      // No route: Hono's own 404 stands. This guard judges bodies, not addresses, and a path nobody
      // registered is not a path whose fields were ignored.
      if (route) {
        const text = await c.req.raw
          .clone()
          .text()
          .catch(() => "");
        if (text.trim() !== "") {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            return c.json(
              {
                error: `${method} ${route.path} expects a JSON object body: it is not valid JSON.`,
                code: "INVALID_BODY",
              },
              400,
            );
          }
          try {
            checkBodyFields(method, route.path, parsed);
          } catch (error) {
            if (error instanceof UnknownBodyFieldError) {
              return c.json(
                {
                  error: error.message,
                  code: error.code,
                  unknown_fields: [...error.unknownFields],
                  accepted_fields: [...error.acceptedFields],
                  ...(Object.keys(error.suggestions).length
                    ? { did_you_mean: error.suggestions }
                    : {}),
                },
                400,
              );
            }
            if (error instanceof InvalidBodyError) {
              return c.json({ error: error.message, code: error.code }, 400);
            }
            if (error instanceof UndeclaredBodyRouteError) {
              return c.json({ error: error.message, code: error.code }, 500);
            }
            throw error;
          }
        }
      }
    }
    await next();
  };
}

import { eq, getTableColumns, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { BaseStore } from "./base-store.js";
import type { Db } from "./db.js";
import { scopeRequests } from "./schema.js";
import type { ExpansionDomain } from "../application/pm/scope-request.js";

/**
 * Durable record of a scope expansion a project asked for, and the emperor's answer to it.
 *
 * Why a store of its own (suite 12, `s12r1`). The front office stopped on a four-part expansion and said
 * the right sentence — *"the four asks are not one ask"* — and then had nowhere to put them. The gate it
 * raised offered **combinations**, so the answer recorded a sentence about a bundle; the next turn could
 * not read the asks back (*"The four asks are not retrievable from any store either of us can read"*,
 * measured in the same run), and there was no way to approve payments while leaving the mobile app
 * parked. A decision the operator takes must be recorded against a named request, or it is a sentence.
 *
 * Three properties, each measured as absent and therefore each a rule:
 *
 * 1. **One row per expansion.** `domain` is the unit of approval. Approving one never authorizes another.
 * 2. **No expiry.** A preview expires because a plan goes stale against a checkout; a request for a
 *    payments feature does not. (This is the difference BOARD F-012 asks for on the other object: an
 *    approval needs a lifetime, a request does not.)
 * 3. **The platform rewrite is refused at creation, not offered as an option.** A row may exist with
 *    `status: "refused"` so the operator can see what was declined, but it can never be approved.
 */

export type ScopeRequestStatus = "pending" | "approved" | "rejected" | "refused";

export interface ScopeRequestRecord {
  id: string;
  projectSlug: string;
  /** The operator's words, verbatim. */
  request: string;
  domain: ExpansionDomain;
  summary: string;
  blastRadius: string[];
  cost?: string;
  requestedByAgentId?: string;
  conversationId?: string;
  status: ScopeRequestStatus;
  /** The operator's answer, in their own words, once there is one. */
  decision?: string;
  decidedByAgentId?: string;
  decidedAt?: string;
  createdAt: string;
}

export class ScopeRequestStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" = "VALIDATION",
  ) {
    super(message);
    this.name = "ScopeRequestStoreError";
  }
}

/** Statuses a request can be answered from, i.e. the ones that are still open. */
const ANSWERABLE: ScopeRequestStatus[] = ["pending"];

export class ScopeRequestStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  /**
   * Records one expansion. Returns the row, and the row that already existed when this is a repeat.
   *
   * Idempotent by **domain within a project while a decision is open**: an agent re-raising the same
   * expansion on the next turn must not double the operator's list, which is the F-049 shape one object
   * over. A re-raise after a decision is a new request, because the checkout, the price or the ask may
   * have changed — the same rule `QuestionStore.findPendingDuplicate` follows.
   */
  request(input: {
    projectSlug: string;
    request: string;
    domain: ExpansionDomain;
    summary: string;
    blastRadius: string[];
    cost?: string;
    requestedByAgentId?: string;
    conversationId?: string;
    status?: Extract<ScopeRequestStatus, "pending" | "refused">;
    decision?: string;
  }): { record: ScopeRequestRecord; alreadyOpen: boolean } {
    const projectSlug = input.projectSlug?.trim();
    if (!projectSlug) throw new ScopeRequestStoreError("A scope request must name the project it expands.");
    if (!input.request?.trim()) throw new ScopeRequestStoreError("The operator's request is required.");
    if (!input.summary?.trim()) throw new ScopeRequestStoreError("A scope request must state what would change.");
    if (!input.blastRadius?.length) {
      throw new ScopeRequestStoreError(
        "A scope request must state its blast radius: a request with no paths cannot be decided.",
      );
    }

    const status: ScopeRequestStatus = input.status ?? "pending";

    // A refusal is a **record of something declined**, so it is filed beside an open request and never
    // replaces one; it is not answerable, and two refusals in one project are two records.
    if (status === "pending") {
      const existing = this.list({ projectSlug }).find(
        (candidate) => candidate.domain === input.domain && ANSWERABLE.includes(candidate.status),
      );
      if (existing) return { record: existing, alreadyOpen: true };
    }

    const decision = status === "refused" ? input.decision?.trim() : undefined;

    const record: ScopeRequestRecord = {
      id: uuidv4(),
      projectSlug,
      request: input.request.trim(),
      domain: input.domain,
      summary: input.summary.trim(),
      blastRadius: input.blastRadius.map((entry) => entry.trim()).filter(Boolean),
      cost: input.cost?.trim() || undefined,
      requestedByAgentId: input.requestedByAgentId,
      conversationId: input.conversationId,
      status,
      decision,
      decidedAt: decision ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    this.db
      .insert(scopeRequests)
      .values({
        id: record.id,
        projectSlug: record.projectSlug,
        request: record.request,
        domain: record.domain,
        summary: record.summary,
        blastRadiusJson: JSON.stringify(record.blastRadius),
        cost: record.cost ?? null,
        requestedByAgentId: record.requestedByAgentId ?? null,
        conversationId: record.conversationId ?? null,
        status: record.status,
        decision: record.decision ?? null,
        decidedByAgentId: null,
        decidedAt: record.decidedAt ?? null,
        createdAt: record.createdAt,
      })
      .run();

    return { record, alreadyOpen: false };
  }

  /**
   * Answers one request, and only that one.
   *
   * A refusal is not answerable — the point of filing it as `refused` is that no surface can turn it
   * into work — and a decided request is not re-answerable, because a decision that can be overwritten
   * silently is not a record of a decision.
   */
  decide(
    id: string,
    input: { approve: boolean; decision?: string; decidedByAgentId?: string },
  ): ScopeRequestRecord {
    const existing = this.get(id);
    if (!existing) throw new ScopeRequestStoreError(`Scope request "${id}" not found.`, "NOT_FOUND");
    if (existing.status === "refused") {
      throw new ScopeRequestStoreError(
        "This request was refused when it was filed: the factory does not rewrite its own platform as " +
          "project work. It cannot be approved, and approving it would not create work.",
      );
    }
    if (!ANSWERABLE.includes(existing.status)) {
      throw new ScopeRequestStoreError(
        `Scope request "${id}" was already ${existing.status}, so it has nothing left to decide.`,
        "CONFLICT",
      );
    }

    const decision = input.decision?.trim() || (input.approve ? "Approved." : "Rejected.");
    const decidedAt = new Date().toISOString();
    const status: ScopeRequestStatus = input.approve ? "approved" : "rejected";

    this.db
      .update(scopeRequests)
      .set({
        status,
        decision,
        decidedByAgentId: input.decidedByAgentId ?? null,
        decidedAt,
      })
      .where(eq(scopeRequests.id, id))
      .run();

    return { ...existing, status, decision, decidedAt, decidedByAgentId: input.decidedByAgentId };
  }

  /**
   * Requests, newest first.
   *
   * `rowid` descending as the tiebreaker, for the reason `RefusalStore.list` states: two rows written in
   * the same millisecond have no order by `createdAt` alone, and a stable sort then lists the older first.
   */
  list(filter?: { projectSlug?: string; status?: ScopeRequestStatus }): ScopeRequestRecord[] {
    return this.db
      .select({ ...getTableColumns(scopeRequests), rowid: sql<number>`rowid` })
      .from(scopeRequests)
      .all()
      .filter((row) => !filter?.projectSlug || row.projectSlug === filter.projectSlug)
      .filter((row) => !filter?.status || row.status === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.rowid - a.rowid)
      .map((row) => this.map(row));
  }

  get(id: string): ScopeRequestRecord | undefined {
    const row = this.db.select().from(scopeRequests).where(eq(scopeRequests.id, id)).get();
    return row ? this.map(row) : undefined;
  }

  private map(row: typeof scopeRequests.$inferSelect): ScopeRequestRecord {
    let blastRadius: string[] = [];
    try {
      const parsed = JSON.parse(row.blastRadiusJson) as unknown;
      if (Array.isArray(parsed)) blastRadius = parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
      // A row whose radius cannot be read still lists: the operator sees the request and that its price
      // is missing, which is better than a list that hides the row.
      blastRadius = [];
    }
    return {
      id: row.id,
      projectSlug: row.projectSlug,
      request: row.request,
      domain: row.domain as ExpansionDomain,
      summary: row.summary,
      blastRadius,
      cost: row.cost ?? undefined,
      requestedByAgentId: row.requestedByAgentId ?? undefined,
      conversationId: row.conversationId ?? undefined,
      status: row.status as ScopeRequestStatus,
      decision: row.decision ?? undefined,
      decidedByAgentId: row.decidedByAgentId ?? undefined,
      decidedAt: row.decidedAt ?? undefined,
      createdAt: row.createdAt,
    };
  }
}

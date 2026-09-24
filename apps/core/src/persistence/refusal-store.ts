import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { BaseStore } from "./base-store.js";
import type { Db } from "./db.js";
import { scopeRefusals } from "./schema.js";

/**
 * Durable record of work the factory declined to accept.
 *
 * Why this exists. The product refuses out-of-scope work — non-software deliverables — and until now
 * the refusal lived only in prose: the front office said "that is out of scope" in a reply and forgot
 * it. Nothing recorded that a request was declined, what boundary it crossed, or how often it happens.
 *
 * That is the [BOARD F-007](../../../../docs/eval/results/BOARD.md) shape — a behaviour with no durable
 * sink — and it makes principle 1 of the [charter](../../../../docs/roadmap/01-philosophy.md) only
 * half true. "Refused clearly" is claimable from a transcript; it is *checkable* only from a record.
 *
 * Three consequences follow from having the record, and they are the reason it is worth the table:
 *
 * 1. **The operator can see what was declined.** A refusal is a decision the factory made on the
 *    operator's behalf, so it belongs on a surface exactly as a question or a blocker does.
 * 2. **The boundary becomes measurable.** How often work is refused, and for which boundary, is a
 *    product fact rather than an anecdote.
 * 3. **A refusal stops being a dead end.** A declined request can be revisited when the boundary
 *    changes, because it is a record with a reason instead of a forgotten sentence.
 *
 * It is deliberately **not** a work item. Creating a container for work the factory refuses would put
 * out-of-scope work in the plan, which is the thing the refusal exists to prevent.
 */

export type RefusalBoundary =
  /** Creative writing and narrative work. */
  | "creative_writing"
  /** Open-ended non-technical research and analysis. */
  | "non_technical_research"
  /** Non-technical documents: legal instruments, grant applications, policy, HR material. */
  | "non_technical_document"
  /** Design as a standalone deliverable rather than an interface specification. */
  | "standalone_design"
  /** The request is software, but the factory cannot verify the acceptance evidence it would need. */
  | "unverifiable_evidence";

/** Which surface the refusal was made on. Recorded so parity is checkable. */
export type RefusalSurface = "chat" | "cli" | "api" | "agent";

export interface ScopeRefusalRecord {
  id: string;
  /** The request as it was made, so the decision can be re-examined. */
  request: string;
  /** Which boundary it crossed. */
  boundary: RefusalBoundary;
  /** The boundary stated back to the requester, in the words that were used. */
  boundaryStatement: string;
  /** Agent that made the decision, when an agent made it. */
  refusedByAgentId?: string;
  projectId?: string;
  conversationId?: string;
  surface: RefusalSurface;
  createdAt: string;
}

export class RefusalStoreError extends Error {}

const BOUNDARY_STATEMENTS: Record<RefusalBoundary, string> = {
  creative_writing:
    "Software is the deliverable. Creative writing — fiction, screenplays, poetry, marketing copy, brand voice — is out of scope.",
  non_technical_research:
    "Software is the deliverable. Open-ended non-technical research and analysis is out of scope; a bounded technical investigation of software the project owns is in scope.",
  non_technical_document:
    "Software is the deliverable. Non-technical documents — legal instruments, grant applications, policy papers, HR material — are out of scope.",
  standalone_design:
    "Software is the deliverable. Design as a standalone deliverable is out of scope; an interface specification attached to software is in scope.",
  unverifiable_evidence:
    "Software is the deliverable, but this request has no acceptance evidence the factory can execute, inspect, or measure against a technical contract, so it cannot be verified.",
};

export class RefusalStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  /** The canonical wording for a boundary, so every surface states it the same way. */
  static boundaryStatement(boundary: RefusalBoundary): string {
    return BOUNDARY_STATEMENTS[boundary];
  }

  /**
   * Records a refusal.
   *
   * The request and the statement are required: a refusal with no reason is indistinguishable from a
   * mistake, and the whole point of the record is that the boundary was named.
   */
  record(input: {
    request: string;
    boundary: RefusalBoundary;
    boundaryStatement?: string;
    refusedByAgentId?: string;
    projectId?: string;
    conversationId?: string;
    surface: RefusalSurface;
  }): ScopeRefusalRecord {
    if (!input.request.trim()) throw new RefusalStoreError("The refused request is required.");
    if (!BOUNDARY_STATEMENTS[input.boundary]) {
      throw new RefusalStoreError(`Unknown boundary "${input.boundary}".`);
    }

    const record: ScopeRefusalRecord = {
      id: uuidv4(),
      request: input.request.trim(),
      boundary: input.boundary,
      boundaryStatement: (input.boundaryStatement?.trim() || BOUNDARY_STATEMENTS[input.boundary]),
      refusedByAgentId: input.refusedByAgentId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      surface: input.surface,
      createdAt: new Date().toISOString(),
    };

    this.db
      .insert(scopeRefusals)
      .values({
        id: record.id,
        request: record.request,
        boundary: record.boundary,
        boundaryStatement: record.boundaryStatement,
        refusedByAgentId: record.refusedByAgentId ?? null,
        projectId: record.projectId ?? null,
        conversationId: record.conversationId ?? null,
        surface: record.surface,
        createdAt: record.createdAt,
      })
      .run();

    return record;
  }

  list(): ScopeRefusalRecord[] {
    return this.db
      .select()
      .from(scopeRefusals)
      .all()
      .map((row) => this.map(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): ScopeRefusalRecord | undefined {
    const row = this.db.select().from(scopeRefusals).where(eq(scopeRefusals.id, id)).get();
    return row ? this.map(row) : undefined;
  }

  count(): number {
    return this.list().length;
  }

  private map(row: typeof scopeRefusals.$inferSelect): ScopeRefusalRecord {
    return {
      id: row.id,
      request: row.request,
      boundary: row.boundary as RefusalBoundary,
      boundaryStatement: row.boundaryStatement,
      refusedByAgentId: row.refusedByAgentId ?? undefined,
      projectId: row.projectId ?? undefined,
      conversationId: row.conversationId ?? undefined,
      surface: row.surface as RefusalSurface,
      createdAt: row.createdAt,
    };
  }
}

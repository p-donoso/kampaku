import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Db } from "./db.js";
import { BaseStore } from "./base-store.js";
import { projectDocuments, wikiPageComments } from "./schema.js";

export type WikiPageStatus = "draft" | "pending_approval" | "published" | "archived";

/**
 * Whether the page describes what exists or what is planned.
 *
 * Two dimensions, deliberately: **publication** (`status`) says whether the project lead has approved the
 * page, and **maturity** says whether the software it describes is built. A proposal about next quarter's
 * feature is `pending_approval` *and* `planned`, and a published page may still carry a `planned` section —
 * what must never happen is a planned feature described in the present tense.
 */
export type WikiPageMaturity = "shipped" | "planned";

/**
 * Which machinery wrote the row.
 *
 * Plan documents and wiki pages share `project_documents`, and a re-plan has to replace **its own** previous
 * output without touching the project's knowledge. Content cannot tell them apart, so the writer says so.
 */
export type WikiPageOrigin = "plan" | "knowledge";

export class WikiStoreError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "WikiStoreError";
  }
}

export interface WikiPageRecord {
  id: string;
  projectId: string;
  parentId?: string;
  slug: string;
  title: string;
  contentMd: string;
  status: WikiPageStatus;
  /** Absent means the page describes what is built. `planned` means the feature is not built yet. */
  maturity?: WikiPageMaturity;
  /** `plan` when the platform's plan machinery wrote it, `knowledge` when a seat or a human did. */
  origin?: WikiPageOrigin;
  sortOrder: number;
  proposedContentMd?: string;
  proposedTitle?: string;
  proposedByAgentId?: string;
  proposedAt?: string;
  approvedByAgentId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WikiCommentRecord {
  id: string;
  pageId: string;
  projectId: string;
  parentCommentId?: string;
  authorAgentId?: string;
  authorName?: string;
  content: string;
  createdAt: string;
}

export interface WikiPageTreeNode {
  page: WikiPageRecord;
  children: WikiPageTreeNode[];
}

export class WikiStore extends BaseStore {
  constructor(db: Db) {
    super(db);
  }

  createPage(input: {
    projectId: string;
    parentId?: string;
    slug: string;
    title: string;
    contentMd?: string;
    status?: WikiPageStatus;
    maturity?: WikiPageMaturity;
    origin?: WikiPageOrigin;
    sortOrder?: number;
  }): WikiPageRecord {
    if (input.parentId) {
      const parent = this.getPage(input.parentId);
      if (!parent || parent.projectId !== input.projectId) {
        throw new WikiStoreError("Parent page not found in project.", "NOT_FOUND");
      }
    }

    const existing = this.getPageBySlug(input.projectId, input.slug);
    if (existing) {
      throw new WikiStoreError(`Wiki page slug "${input.slug}" already exists.`, "CONFLICT");
    }

    const now = new Date().toISOString();
    const page: WikiPageRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      parentId: input.parentId,
      slug: input.slug,
      title: input.title,
      contentMd: input.contentMd ?? "",
      status: input.status ?? "published",
      maturity: input.maturity,
      origin: input.origin ?? "knowledge",
      sortOrder: input.sortOrder ?? this.nextSortOrder(input.projectId, input.parentId),
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(projectDocuments).values(this.toRow(page)).run();
    return page;
  }

  getPage(id: string): WikiPageRecord | undefined {
    const row = this.db.select().from(projectDocuments).where(eq(projectDocuments.id, id)).get();
    return row ? this.mapPage(row) : undefined;
  }

  getPageBySlug(projectId: string, slug: string): WikiPageRecord | undefined {
    const row = this.db
      .select()
      .from(projectDocuments)
      .where(and(eq(projectDocuments.projectId, projectId), eq(projectDocuments.slug, slug)))
      .get();
    return row ? this.mapPage(row) : undefined;
  }

  listPagesByProject(projectId: string): WikiPageRecord[] {
    return this.db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .all()
      .map((row) => this.mapPage(row))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  listPendingPages(projectId: string): WikiPageRecord[] {
    return this.listPagesByProject(projectId).filter((page) => page.status === "pending_approval");
  }

  buildPageTree(pages: WikiPageRecord[]): WikiPageTreeNode[] {
    const byParent = new Map<string | null, WikiPageRecord[]>();
    for (const page of pages) {
      const key = page.parentId ?? null;
      const bucket = byParent.get(key) ?? [];
      bucket.push(page);
      byParent.set(key, bucket);
    }

    const build = (parentId: string | null): WikiPageTreeNode[] => {
      const nodes = byParent.get(parentId) ?? [];
      return nodes
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
        .map((page) => ({ page, children: build(page.id) }));
    };

    return build(null);
  }

  updatePageDirect(
    id: string,
    patch: Partial<Pick<WikiPageRecord, "title" | "contentMd" | "parentId" | "sortOrder" | "status" | "maturity">>,
    approvedByAgentId?: string,
  ): WikiPageRecord {
    const existing = this.getPage(id);
    if (!existing) throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");

    if (patch.parentId !== undefined && patch.parentId !== existing.parentId) {
      if (patch.parentId) {
        this.validateParentMove(id, patch.parentId, existing.projectId);
      }
    }

    const now = new Date().toISOString();
    const updated: WikiPageRecord = {
      ...existing,
      title: patch.title ?? existing.title,
      contentMd: patch.contentMd ?? existing.contentMd,
      parentId: patch.parentId === undefined ? existing.parentId : patch.parentId,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      status: patch.status ?? existing.status,
      maturity: patch.maturity === undefined ? existing.maturity : patch.maturity,
      proposedContentMd: undefined,
      proposedTitle: undefined,
      proposedByAgentId: undefined,
      proposedAt: undefined,
      approvedByAgentId: approvedByAgentId ?? existing.approvedByAgentId,
      approvedAt: approvedByAgentId ? now : existing.approvedAt,
      updatedAt: now,
    };

    this.db.update(projectDocuments).set(this.toRow(updated)).where(eq(projectDocuments.id, id)).run();
    return updated;
  }

  proposeEdit(
    id: string,
    input: { title?: string; contentMd: string; proposedByAgentId: string; maturity?: WikiPageMaturity },
  ): WikiPageRecord {
    const existing = this.getPage(id);
    if (!existing) throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");
    if (existing.status === "archived") {
      throw new WikiStoreError("Archived pages cannot be edited.", "VALIDATION");
    }

    const now = new Date().toISOString();
    const updated: WikiPageRecord = {
      ...existing,
      status: "pending_approval",
      proposedContentMd: input.contentMd,
      proposedTitle: input.title,
      proposedByAgentId: input.proposedByAgentId,
      proposedAt: now,
      maturity: input.maturity ?? existing.maturity,
      updatedAt: now,
    };

    this.db.update(projectDocuments).set(this.toRow(updated)).where(eq(projectDocuments.id, id)).run();
    return updated;
  }

  approveEdit(id: string, approvedByAgentId: string): WikiPageRecord {
    const existing = this.getPage(id);
    if (!existing) throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");
    if (existing.status !== "pending_approval" || !existing.proposedContentMd) {
      throw new WikiStoreError("Page has no pending edit to approve.", "VALIDATION");
    }

    const now = new Date().toISOString();
    const updated: WikiPageRecord = {
      ...existing,
      title: existing.proposedTitle?.trim() || existing.title,
      contentMd: existing.proposedContentMd,
      status: "published",
      proposedContentMd: undefined,
      proposedTitle: undefined,
      proposedByAgentId: undefined,
      proposedAt: undefined,
      approvedByAgentId,
      approvedAt: now,
      updatedAt: now,
    };

    this.db.update(projectDocuments).set(this.toRow(updated)).where(eq(projectDocuments.id, id)).run();
    return updated;
  }

  rejectEdit(id: string): WikiPageRecord {
    const existing = this.getPage(id);
    if (!existing) throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");
    if (existing.status !== "pending_approval") {
      throw new WikiStoreError("Page has no pending edit to reject.", "VALIDATION");
    }

    const now = new Date().toISOString();
    const updated: WikiPageRecord = {
      ...existing,
      // A rejected proposal goes back to where it came from. It used to go to `published` unconditionally,
      // which published a page that had never been published whenever the proposal was the **creation** of a
      // page (`propose_wiki_edit` creates the container as `pending_approval`): the lead's rejection made an
      // unapproved page live, and the tree then showed it with no pending marker. A page with no approval and
      // no content of its own was never live, so it returns to `draft`.
      status:
        existing.approvedAt === undefined && existing.contentMd.trim() === "" ? "draft" : "published",
      proposedContentMd: undefined,
      proposedTitle: undefined,
      proposedByAgentId: undefined,
      proposedAt: undefined,
      updatedAt: now,
    };

    this.db.update(projectDocuments).set(this.toRow(updated)).where(eq(projectDocuments.id, id)).run();
    return updated;
  }

  deletePage(id: string): void {
    const page = this.getPage(id);
    if (!page) throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");

    const children = this.db
      .select()
      .from(projectDocuments)
      .where(eq(projectDocuments.parentId, id))
      .all();
    if (children.length > 0) {
      throw new WikiStoreError("Delete subpages first or move them to another parent.", "CONFLICT");
    }

    this.db.delete(wikiPageComments).where(eq(wikiPageComments.pageId, id)).run();
    this.db.delete(projectDocuments).where(eq(projectDocuments.id, id)).run();
  }

  deleteProjectWiki(projectId: string): void {
    this.db.delete(wikiPageComments).where(eq(wikiPageComments.projectId, projectId)).run();
    this.db.delete(projectDocuments).where(eq(projectDocuments.projectId, projectId)).run();
  }

  addComment(input: {
    pageId: string;
    projectId: string;
    content: string;
    parentCommentId?: string;
    authorAgentId?: string;
    authorName?: string;
  }): WikiCommentRecord {
    const page = this.getPage(input.pageId);
    if (!page || page.projectId !== input.projectId) {
      throw new WikiStoreError("Wiki page not found.", "NOT_FOUND");
    }

    if (input.parentCommentId) {
      const parent = this.getComment(input.parentCommentId);
      if (!parent || parent.pageId !== input.pageId) {
        throw new WikiStoreError("Parent comment not found on this page.", "NOT_FOUND");
      }
    }

    if (!input.authorAgentId && !input.authorName?.trim()) {
      throw new WikiStoreError("Comment requires author_agent_id or author_name.", "VALIDATION");
    }

    const comment: WikiCommentRecord = {
      id: uuidv4(),
      pageId: input.pageId,
      projectId: input.projectId,
      parentCommentId: input.parentCommentId,
      authorAgentId: input.authorAgentId,
      authorName: input.authorName?.trim(),
      content: input.content.trim(),
      createdAt: new Date().toISOString(),
    };

    this.db.insert(wikiPageComments).values({
      id: comment.id,
      pageId: comment.pageId,
      projectId: comment.projectId,
      parentCommentId: comment.parentCommentId ?? null,
      authorAgentId: comment.authorAgentId ?? null,
      authorName: comment.authorName ?? null,
      content: comment.content,
      createdAt: comment.createdAt,
    }).run();

    return comment;
  }

  getComment(id: string): WikiCommentRecord | undefined {
    const row = this.db.select().from(wikiPageComments).where(eq(wikiPageComments.id, id)).get();
    return row ? this.mapComment(row) : undefined;
  }

  listCommentsByPage(pageId: string): WikiCommentRecord[] {
    return this.db
      .select()
      .from(wikiPageComments)
      .where(eq(wikiPageComments.pageId, pageId))
      .all()
      .map((row) => this.mapComment(row))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  findBacklinks(projectId: string, targetSlug: string): WikiPageRecord[] {
    const pattern = `[[${targetSlug}`;
    return this.listPagesByProject(projectId).filter(
      (page) =>
        page.status === "published" &&
        (page.contentMd.includes(pattern) ||
          (page.proposedContentMd?.includes(pattern) ?? false)),
    );
  }

  private nextSortOrder(projectId: string, parentId?: string): number {
    const siblings = this.db
      .select()
      .from(projectDocuments)
      .where(
        parentId
          ? eq(projectDocuments.parentId, parentId)
          : isNull(projectDocuments.parentId),
      )
      .all()
      .filter((row) => row.projectId === projectId);
    return siblings.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1;
  }

  private validateParentMove(pageId: string, parentId: string, projectId: string): void {
    if (parentId === pageId) {
      throw new WikiStoreError("A page cannot be its own parent.", "VALIDATION");
    }
    const parent = this.getPage(parentId);
    if (!parent || parent.projectId !== projectId) {
      throw new WikiStoreError("Parent page not found in project.", "NOT_FOUND");
    }
    let cursor: WikiPageRecord | undefined = parent;
    while (cursor) {
      if (cursor.id === pageId) {
        throw new WikiStoreError("Cannot move a page under its own descendant.", "VALIDATION");
      }
      cursor = cursor.parentId ? this.getPage(cursor.parentId) : undefined;
    }
  }

  private mapPage(row: typeof projectDocuments.$inferSelect): WikiPageRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      parentId: row.parentId ?? undefined,
      slug: row.slug,
      title: row.title,
      contentMd: row.contentMd,
      status: (row.status ?? "published") as WikiPageStatus,
      maturity: (row.maturity ?? undefined) as WikiPageMaturity | undefined,
      origin: (row.origin ?? "knowledge") as WikiPageOrigin,
      sortOrder: row.sortOrder ?? 0,
      proposedContentMd: row.proposedContentMd ?? undefined,
      proposedTitle: row.proposedTitle ?? undefined,
      proposedByAgentId: row.proposedByAgentId ?? undefined,
      proposedAt: row.proposedAt ?? undefined,
      approvedByAgentId: row.approvedByAgentId ?? undefined,
      approvedAt: row.approvedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapComment(row: typeof wikiPageComments.$inferSelect): WikiCommentRecord {
    return {
      id: row.id,
      pageId: row.pageId,
      projectId: row.projectId,
      parentCommentId: row.parentCommentId ?? undefined,
      authorAgentId: row.authorAgentId ?? undefined,
      authorName: row.authorName ?? undefined,
      content: row.content,
      createdAt: row.createdAt,
    };
  }

  private toRow(page: WikiPageRecord): typeof projectDocuments.$inferInsert {
    return {
      id: page.id,
      projectId: page.projectId,
      parentId: page.parentId ?? null,
      slug: page.slug,
      title: page.title,
      contentMd: page.contentMd,
      status: page.status,
      maturity: page.maturity ?? null,
      origin: page.origin ?? null,
      sortOrder: page.sortOrder,
      proposedContentMd: page.proposedContentMd ?? null,
      proposedTitle: page.proposedTitle ?? null,
      proposedByAgentId: page.proposedByAgentId ?? null,
      proposedAt: page.proposedAt ?? null,
      approvedByAgentId: page.approvedByAgentId ?? null,
      approvedAt: page.approvedAt ?? null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  }
}

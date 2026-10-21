"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  getWikiPage,
  getWikiTree,
  postWikiComment,
} from "@/lib/api";
import type { WikiCommentTreeNode, WikiPageDetail, WikiPageTreeNode } from "@/lib/types";

function WikiTreeNav({
  nodes,
  selectedSlug,
  onSelect,
  depth = 0,
}: {
  nodes: WikiPageTreeNode[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "ml-3 mt-1 space-y-1 border-l border-border pl-2"}>
      {nodes.map(({ page, children }) => (
        <li key={page.id}>
          <button
            type="button"
            onClick={() => onSelect(page.slug)}
            className={`block w-full rounded px-2 py-1 text-left text-xs ${
              selectedSlug === page.slug
                ? "bg-brand/10 text-brand"
                : "text-secondary hover:bg-elevated hover:text-foreground"
            }`}
          >
            {page.title}
            {page.status === "pending_approval" && (
              <span className="ml-1 text-[10px] text-warning">proposal</span>
            )}
            {page.maturity === "planned" && (
              <span className="ml-1 text-[10px] text-info">planned</span>
            )}
          </button>
          {children.length > 0 && (
            <WikiTreeNav nodes={children} selectedSlug={selectedSlug} onSelect={onSelect} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

function WikiTreeOptions({
  nodes,
  depth = 0,
}: {
  nodes: WikiPageTreeNode[];
  depth?: number;
}) {
  return nodes.map(({ page, children }) => (
    <Fragment key={page.id}>
      <option value={page.slug}>
        {`${"— ".repeat(depth)}${page.title}${page.status === "pending_approval" ? " (proposal)" : ""}${page.maturity === "planned" ? " (planned)" : ""}`}
      </option>
      {children.length > 0 && <WikiTreeOptions nodes={children} depth={depth + 1} />}
    </Fragment>
  ));
}

function renderWikiContent(content: string, onLinkClick: (slug: string) => void) {
  const parts = content.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
    if (!match) return <span key={index}>{part}</span>;
    const slug = match[1];
    const label = match[2] ?? slug;
    return (
      <button
        key={index}
        type="button"
        onClick={() => onLinkClick(slug)}
        className="text-brand hover:underline"
      >
        {label}
      </button>
    );
  });
}

function CommentThread({
  nodes,
  onReply,
}: {
  nodes: WikiCommentTreeNode[];
  onReply: (parentId: string) => void;
}) {
  if (!nodes.length) {
    return <p className="text-xs text-muted">No messages yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {nodes.map(({ comment, children }) => (
        <li key={comment.id} className="rounded-lg border border-border bg-elevated/40 p-3">
          <div className="flex items-center gap-2 text-[10px] text-muted">
            <span className="font-medium text-secondary">
              {comment.authorSlug ?? comment.authorName ?? "Anonymous"}
            </span>
            <span>{new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.content}</p>
          <button
            type="button"
            onClick={() => onReply(comment.id)}
            className="mt-2 text-[10px] text-brand hover:underline"
          >
            Reply
          </button>
          {children.length > 0 && (
            <div className="ml-3 mt-2 border-l border-border pl-3">
              <CommentThread nodes={children} onReply={onReply} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProjectWikiPanel({ projectSlug }: { projectSlug: string }) {
  const [tree, setTree] = useState<WikiPageTreeNode[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const loadTree = useCallback(async () => {
    const data = await getWikiTree(projectSlug);
    setTree(data.tree);
    setPendingCount(data.pendingCount);
    setSelectedSlug((current) => current ?? data.tree[0]?.page.slug ?? null);
  }, [projectSlug]);

  const loadPage = useCallback(
    async (slug: string) => {
      const data = await getWikiPage(projectSlug, slug);
      setDetail(data);
    },
    [projectSlug],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadTree()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [loadTree]);

  useEffect(() => {
    if (!selectedSlug) return;
    loadPage(selectedSlug).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [selectedSlug, loadPage]);

  async function submitComment() {
    if (!selectedSlug || !commentDraft.trim()) return;
    setPosting(true);
    try {
      await postWikiComment(projectSlug, selectedSlug, {
        content: commentDraft.trim(),
        author_name: "Emperor",
        parent_comment_id: replyTo ?? undefined,
      });
      setCommentDraft("");
      setReplyTo(null);
      await loadPage(selectedSlug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  if (loading && !detail) {
    return <p className="text-sm text-muted">Loading wiki…</p>;
  }

  if (error && !detail) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return (
    <div className="flex min-h-[24rem] flex-col gap-4 md:flex-row">
      <label className="flex flex-col gap-1 text-xs text-secondary md:hidden">
        Pages
        <select
          value={selectedSlug ?? ""}
          onChange={(event) => setSelectedSlug(event.target.value)}
          disabled={tree.length === 0}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand/50 disabled:opacity-50"
        >
          {tree.length === 0 ? (
            <option value="">No wiki pages yet</option>
          ) : (
            <WikiTreeOptions nodes={tree} />
          )}
        </select>
      </label>

      <aside className="hidden w-48 shrink-0 rounded-xl bg-surface/30 p-3 md:block">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-secondary">Pages</h3>
          {pendingCount > 0 && (
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
              {pendingCount} pending
            </span>
          )}
        </div>
        {tree.length === 0 ? (
          <p className="text-xs text-muted">No wiki pages yet.</p>
        ) : (
          <WikiTreeNav
            nodes={tree}
            selectedSlug={selectedSlug}
            onSelect={setSelectedSlug}
          />
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        {detail ? (
          <>
            <section className="rounded-xl border border-border bg-surface/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium text-foreground">{detail.page.title}</h3>
                {/* Two dimensions, two badges. `status` says whether the lead approved the page; `maturity` says
                    whether the software it describes exists. A single "pending" marker answered neither question,
                    which is what suite 09's prompt 2 asked and no surface could answer (BOARD F-120). */}
                <span
                  data-testid="wiki-publication"
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    detail.publication === "proposal"
                      ? "bg-warning/10 text-warning"
                      : detail.publication === "draft"
                        ? "bg-elevated text-muted"
                        : "bg-success/10 text-success"
                  }`}
                >
                  {detail.publication === "proposal" ? "proposal — not published" : (detail.publication ?? "published")}
                </span>
                {detail.page.maturity === "planned" && (
                  <span data-testid="wiki-maturity" className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
                    planned — not built
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted">{detail.page.slug}</p>

              {detail.pendingEdit && (
                <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs font-medium text-warning">Pending edit</p>
                  <p className="mt-1 text-[10px] text-muted">
                    Proposed by {detail.pendingEdit.proposedBySlug ?? "unknown"}
                  </p>
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-secondary">
                    {detail.pendingEdit.contentMd.slice(0, 2000)}
                  </pre>
                </div>
              )}

              <div className="prose mt-4 max-w-none whitespace-pre-wrap text-sm text-foreground">
                {renderWikiContent(detail.page.contentMd, setSelectedSlug)}
              </div>

              {(detail.links.length > 0 || detail.backlinks.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
                  {detail.links.length > 0 && (
                    <div>
                      <span className="text-muted">Links: </span>
                      {detail.links.map((link) => (
                        <button
                          key={link.slug}
                          type="button"
                          onClick={() => setSelectedSlug(link.slug)}
                          className={`mr-2 ${link.exists ? "text-brand" : "text-error line-through"}`}
                        >
                          {link.label ?? link.slug}
                        </button>
                      ))}
                    </div>
                  )}
                  {detail.backlinks.length > 0 && (
                    <div>
                      <span className="text-muted">Backlinks: </span>
                      {detail.backlinks.map((link) => (
                        <button
                          key={link.pageId}
                          type="button"
                          onClick={() => setSelectedSlug(link.slug)}
                          className="mr-2 text-info hover:underline"
                        >
                          {link.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface/30 p-4">
              <h4 className="mb-3 text-sm font-medium text-foreground">Messageboard</h4>
              <CommentThread nodes={detail.comments} onReply={setReplyTo} />
              <div className="mt-4 space-y-2">
                {replyTo && (
                  <p className="text-[10px] text-muted">
                    Replying to comment…{" "}
                    <button type="button" onClick={() => setReplyTo(null)} className="text-brand hover:underline">
                      cancel
                    </button>
                  </p>
                )}
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Write a message…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand/50"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={posting || !commentDraft.trim()}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-background hover:bg-brand-gold disabled:opacity-50"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-muted">Select a page.</p>
        )}
      </div>
    </div>
  );
}

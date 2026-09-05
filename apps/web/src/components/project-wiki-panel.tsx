"use client";

import { useCallback, useEffect, useState } from "react";
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
    <ul className={depth === 0 ? "space-y-1" : "ml-3 mt-1 space-y-1 border-l border-zinc-800 pl-2"}>
      {nodes.map(({ page, children }) => (
        <li key={page.id}>
          <button
            type="button"
            onClick={() => onSelect(page.slug)}
            className={`block w-full rounded px-2 py-1 text-left text-xs ${
              selectedSlug === page.slug
                ? "bg-amber-500/10 text-amber-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {page.title}
            {page.status === "pending_approval" && (
              <span className="ml-1 text-[10px] text-amber-500">pending</span>
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
        className="text-amber-500 hover:text-amber-400 hover:underline"
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
    return <p className="text-xs text-zinc-600">No messages yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {nodes.map(({ comment, children }) => (
        <li key={comment.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="font-medium text-zinc-400">
              {comment.authorSlug ?? comment.authorName ?? "Anonymous"}
            </span>
            <span>{new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{comment.content}</p>
          <button
            type="button"
            onClick={() => onReply(comment.id)}
            className="mt-2 text-[10px] text-amber-500 hover:text-amber-400"
          >
            Reply
          </button>
          {children.length > 0 && (
            <div className="ml-3 mt-2 border-l border-zinc-800 pl-3">
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
    if (!selectedSlug && data.tree[0]?.page.slug) {
      setSelectedSlug(data.tree[0].page.slug);
    }
  }, [projectSlug, selectedSlug]);

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
    return <p className="text-sm text-zinc-500">Loading wiki…</p>;
  }

  if (error && !detail) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  return (
    <div className="flex min-h-[24rem] gap-4">
      <aside className="w-48 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium text-zinc-400">Pages</h3>
          {pendingCount > 0 && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        {tree.length === 0 ? (
          <p className="text-xs text-zinc-600">No wiki pages yet.</p>
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
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h3 className="text-lg font-medium text-zinc-100">{detail.page.title}</h3>
              <p className="mt-1 font-mono text-[10px] text-zinc-600">{detail.page.slug}</p>

              {detail.pendingEdit && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-medium text-amber-400">Pending edit</p>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Proposed by {detail.pendingEdit.proposedBySlug ?? "unknown"}
                  </p>
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-400">
                    {detail.pendingEdit.contentMd.slice(0, 2000)}
                  </pre>
                </div>
              )}

              <div className="prose prose-invert mt-4 max-w-none whitespace-pre-wrap text-sm text-zinc-300">
                {renderWikiContent(detail.page.contentMd, setSelectedSlug)}
              </div>

              {(detail.links.length > 0 || detail.backlinks.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-800 pt-3 text-xs">
                  {detail.links.length > 0 && (
                    <div>
                      <span className="text-zinc-500">Links: </span>
                      {detail.links.map((link) => (
                        <button
                          key={link.slug}
                          type="button"
                          onClick={() => setSelectedSlug(link.slug)}
                          className={`mr-2 ${link.exists ? "text-amber-500" : "text-red-400 line-through"}`}
                        >
                          {link.label ?? link.slug}
                        </button>
                      ))}
                    </div>
                  )}
                  {detail.backlinks.length > 0 && (
                    <div>
                      <span className="text-zinc-500">Backlinks: </span>
                      {detail.backlinks.map((link) => (
                        <button
                          key={link.pageId}
                          type="button"
                          onClick={() => setSelectedSlug(link.slug)}
                          className="mr-2 text-violet-400 hover:underline"
                        >
                          {link.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
              <h4 className="mb-3 text-sm font-medium text-zinc-300">Messageboard</h4>
              <CommentThread nodes={detail.comments} onReply={setReplyTo} />
              <div className="mt-4 space-y-2">
                {replyTo && (
                  <p className="text-[10px] text-zinc-500">
                    Replying to comment…{" "}
                    <button type="button" onClick={() => setReplyTo(null)} className="text-amber-500">
                      cancel
                    </button>
                  </p>
                )}
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Write a message…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={posting || !commentDraft.trim()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-zinc-950 disabled:opacity-50"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Select a page.</p>
        )}
      </div>
    </div>
  );
}

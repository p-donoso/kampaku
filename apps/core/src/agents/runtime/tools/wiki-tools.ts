import type { KampakuToolContext } from "./index.js";
import {
  buildPostActionRuntime,
  recordPostActionLifecycle,
} from "../../../application/pm/post-action/index.js";
import {
  approveWikiEdit,
  getWikiPageDetail,
  getWikiTree,
  listWikiPending,
  postWikiComment,
  proposeWikiEdit,
  rejectWikiEdit,
} from "../../../application/wiki/wiki.js";

function assertWikiStore(ctx: KampakuToolContext) {
  if (!ctx.wikiStore) throw new Error("Wiki store is not available.");
  return ctx.wikiStore;
}

function assertAgentHasWikiSkill(ctx: KampakuToolContext, agentSlug: string): void {
  const agent = ctx.agentStore.getAgentBySlugOrId(agentSlug);
  if (!agent) throw new Error("Agent not found.");
  const skills = ctx.skillStore.listAgentSkills(agent.id);
  if (!skills.includes("workflow-wiki")) {
    throw new Error("Agent requires the workflow-wiki skill.");
  }
}

export interface GetWikiTreeArgs {
  project_id: string;
}

export function executeGetWikiTree(ctx: KampakuToolContext, args: GetWikiTreeArgs & { agent_slug?: string }) {
  if (args.agent_slug) assertAgentHasWikiSkill(ctx, args.agent_slug);
  return getWikiTree(ctx.store, ctx.pmStore, assertWikiStore(ctx), args.project_id);
}

export interface GetWikiPageArgs {
  project_id: string;
  page_slug: string;
  agent_slug?: string;
}

export function executeGetWikiPage(ctx: KampakuToolContext, args: GetWikiPageArgs) {
  if (args.agent_slug) assertAgentHasWikiSkill(ctx, args.agent_slug);
  return getWikiPageDetail(
    ctx.store,
    assertWikiStore(ctx),
    ctx.agentStore,
    args.project_id,
    args.page_slug,
  );
}

export interface ProposeWikiEditArgs {
  agent_slug: string;
  project_id: string;
  page_slug: string;
  content_md: string;
  title?: string;
}

export function executeProposeWikiEdit(ctx: KampakuToolContext, args: ProposeWikiEditArgs) {
  assertAgentHasWikiSkill(ctx, args.agent_slug);
  const page = proposeWikiEdit(
    ctx.store,
    assertWikiStore(ctx),
    ctx.agentStore,
    args.project_id,
    args.page_slug,
    {
      agentSlug: args.agent_slug,
      title: args.title,
      contentMd: args.content_md,
    },
  );
  return {
    ...page,
    message: "Edit proposed. Pending project lead approval.",
  };
}

export interface PostWikiCommentArgs {
  agent_slug: string;
  project_id: string;
  page_slug: string;
  content: string;
  parent_comment_id?: string;
}

export function executePostWikiComment(ctx: KampakuToolContext, args: PostWikiCommentArgs) {
  assertAgentHasWikiSkill(ctx, args.agent_slug);
  return postWikiComment(
    ctx.store,
    assertWikiStore(ctx),
    ctx.agentStore,
    args.project_id,
    args.page_slug,
    {
      agentSlug: args.agent_slug,
      content: args.content,
      parentCommentId: args.parent_comment_id,
    },
  );
}

export interface ListWikiPendingArgs {
  agent_slug: string;
  project_id: string;
}

export function executeListWikiPending(ctx: KampakuToolContext, args: ListWikiPendingArgs) {
  assertAgentHasWikiSkill(ctx, args.agent_slug);
  return {
    pages: listWikiPending(
      ctx.store,
      assertWikiStore(ctx),
      ctx.agentStore,
      args.project_id,
      args.agent_slug,
    ),
  };
}

export interface ApproveWikiEditArgs {
  agent_slug: string;
  project_id: string;
  page_slug: string;
}

export function executeApproveWikiEdit(ctx: KampakuToolContext, args: ApproveWikiEditArgs) {
  assertAgentHasWikiSkill(ctx, args.agent_slug);
  const page = approveWikiEdit(
    ctx.store,
    assertWikiStore(ctx),
    ctx.agentStore,
    args.project_id,
    args.page_slug,
    args.agent_slug,
  );

  recordPostActionLifecycle(
    buildPostActionRuntime({
      pmStore: ctx.pmStore,
      agentStore: ctx.agentStore,
      reviewStore: ctx.postActionStore,
      store: ctx.store,
      journalStore: ctx.journalStore,
      memoryStore: ctx.memoryStore,
      wikiStore: ctx.wikiStore,
    }),
    {
      event: "wiki_reviewed",
      projectId: args.project_id,
      agentSlug: args.agent_slug,
      referenceId: `${page.id}:${page.updatedAt}`,
      summary: `Wiki page "${page.slug}" was approved and published. Approved content now matches the proposal.`,
      decisions: [`Approved the pending edit for ${page.slug}.`],
      followUps: ["Confirm the published page still matches the disk evidence it cites."],
      wikiSyncRequired: ctx.store.getProject(args.project_id)?.wikiSyncRequired === true,
      wikiPages: [{ slug: page.slug, title: page.title, status: page.status }],
    },
  );

  return { ...page, message: "Wiki edit approved and published." };
}

export interface RejectWikiEditArgs {
  agent_slug: string;
  project_id: string;
  page_slug: string;
}

export function executeRejectWikiEdit(ctx: KampakuToolContext, args: RejectWikiEditArgs) {
  assertAgentHasWikiSkill(ctx, args.agent_slug);
  const page = rejectWikiEdit(
    ctx.store,
    assertWikiStore(ctx),
    ctx.agentStore,
    args.project_id,
    args.page_slug,
    args.agent_slug,
  );
  return { ...page, message: "Wiki edit rejected." };
}

export const GET_WIKI_TREE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_wiki_tree",
    description: "List the hierarchical wiki page tree for a project.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project id or slug" },
        agent_slug: { type: "string", description: "Calling agent slug (for skill check)" },
      },
      required: ["project_id"],
    },
  },
};

export const GET_WIKI_PAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_wiki_page",
    description: "Read a wiki page with cross-links, backlinks, pending edits, and messageboard comments.",
    parameters: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        page_slug: { type: "string" },
        agent_slug: { type: "string" },
      },
      required: ["project_id", "page_slug"],
    },
  },
};

export const PROPOSE_WIKI_EDIT_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_wiki_edit",
    description: "Propose a wiki page edit (Markdown). Requires project lead approval before publishing.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
        page_slug: { type: "string" },
        content_md: { type: "string" },
        title: { type: "string" },
      },
      required: ["agent_slug", "project_id", "page_slug", "content_md"],
    },
  },
};

export const POST_WIKI_COMMENT_TOOL = {
  type: "function" as const,
  function: {
    name: "post_wiki_comment",
    description: "Post a message on a wiki page messageboard. Use parent_comment_id to reply in a thread.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
        page_slug: { type: "string" },
        content: { type: "string" },
        parent_comment_id: { type: "string" },
      },
      required: ["agent_slug", "project_id", "page_slug", "content"],
    },
  },
};

export const LIST_WIKI_PENDING_TOOL = {
  type: "function" as const,
  function: {
    name: "list_wiki_pending",
    description: "List wiki pages with pending edits. Only the project lead should call this.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
      },
      required: ["agent_slug", "project_id"],
    },
  },
};

export const APPROVE_WIKI_EDIT_TOOL = {
  type: "function" as const,
  function: {
    name: "approve_wiki_edit",
    description: "Approve a pending wiki edit. Only the project lead (projectLeadAgentId) may call this.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
        page_slug: { type: "string" },
      },
      required: ["agent_slug", "project_id", "page_slug"],
    },
  },
};

export const REJECT_WIKI_EDIT_TOOL = {
  type: "function" as const,
  function: {
    name: "reject_wiki_edit",
    description: "Reject a pending wiki edit. Only the project lead (projectLeadAgentId) may call this.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
        page_slug: { type: "string" },
      },
      required: ["agent_slug", "project_id", "page_slug"],
    },
  },
};

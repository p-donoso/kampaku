import type { KampakuToolContext, ToolRuntimeScope } from "./index.js";
import { KAMPAKU_AGENT_ID } from "../../definitions.js";
import {
  buildPostActionRuntime,
  recordPostActionLifecycle,
} from "../../../application/pm/post-action/index.js";
import {
  approveWikiEdit,
  getProjectKnowledge,
  getWikiPageDetail,
  getWikiTree,
  listWikiPending,
  postWikiComment,
  proposeWikiEdit,
  proposeWikiPage,
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

export interface GetProjectKnowledgeArgs {
  project_slug_or_id: string;
  /** Optional: one page's body. Omit it to list pages and their states. */
  page_slug?: string;
}

/**
 * The front office's read of a project's shared knowledge — the projection, not the store.
 *
 * Measured 2026-10-20 on suite 09's `s09r1`: this seat held no tool that reads a wiki page or its state, and
 * `get_project`'s `documents` carried only `slug` and `title`, so asked which pages were proposals it said
 * *"the document list returns a slug and a title for each page and no publication state … I will not guess at
 * it"*. Ask the question from the record and the answer exists; ask it from a two-field projection and the
 * honest reply is a question back (BOARD F-120).
 *
 * No skill check: `workflow-wiki` is a line capability (propose, comment, approve) and this is a **read** —
 * the same asymmetry `get_project` and `get_job_ledger` already have. Bounded: one page body per call, cut to
 * a stated budget.
 */
export function executeGetProjectKnowledge(ctx: KampakuToolContext, args: GetProjectKnowledgeArgs) {
  if (!ctx.wikiStore) throw new Error("Wiki store is not available.");
  return getProjectKnowledge(
    ctx.store,
    ctx.wikiStore,
    ctx.agentStore,
    args.project_slug_or_id,
    args.page_slug,
  );
}

export interface ProposeWikiPageArgs {
  project_slug_or_id: string;
  slug: string;
  title: string;
  content_md: string;
  /** `planned` when the software the page describes is not built. Required, not inferred. */
  maturity: "shipped" | "planned";
}

/**
 * Records a knowledge page as a **proposal**, for the front office.
 *
 * The counterpart of `executeGetProjectKnowledge`, and the reason the suite's third prompt has an answer at all:
 * asked to add a page about next quarter's feature *without implementing it*, the seat held no way to represent
 * "planned", judged the request unverifiable and refused it. A front office that can only publish what exists
 * cannot record intent, and intent is half of what a knowledge surface is for (BOARD F-120).
 *
 * Narrow on purpose: it lands `pending_approval`, carries its maturity, and creates no work. Publishing still
 * belongs to the linked lead through `approve_wiki_edit`, so the wiki's propose-then-approve rule is unchanged
 * and ADR-0005's exclusion of a front-office publish is kept.
 */
export function executeProposeWikiPage(
  ctx: KampakuToolContext,
  args: ProposeWikiPageArgs,
  scope?: ToolRuntimeScope,
) {
  if (scope && scope.agentId !== KAMPAKU_AGENT_ID) {
    throw new Error("Only the root agent may propose a project knowledge page.");
  }
  if (!ctx.wikiStore) throw new Error("Wiki store is not available.");
  if (args.maturity !== "shipped" && args.maturity !== "planned") {
    throw new Error('maturity must be "shipped" or "planned".');
  }
  const page = proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, args.project_slug_or_id, {
    slug: args.slug,
    title: args.title,
    contentMd: args.content_md,
    maturity: args.maturity,
    agentSlug: ctx.agentStore.getKampakuAgent().slug,
  });
  return {
    slug: page.slug,
    title: page.proposedTitle?.trim() || page.title,
    status: page.status,
    publication: "proposal" as const,
    maturity: page.maturity ?? args.maturity,
    published: false,
    message:
      "Recorded as a proposal, not a page. It is pending the project lead's approval, nothing is published, " +
      "and no work item was created.",
  };
}

export const GET_PROJECT_KNOWLEDGE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_project_knowledge",
    description:
      "Read a project's shared knowledge: every page with its publication state (published, proposal, draft, " +
      "archived) and its maturity (shipped or planned). Pass page_slug to read one page's body. A proposal is " +
      "not a published page.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: { type: "string", description: "Project id or slug" },
        page_slug: { type: "string", description: "Optional page slug, to read one page's body" },
      },
      required: ["project_slug_or_id"],
    },
  },
};

export const PROPOSE_WIKI_PAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_wiki_page",
    description:
      "Propose a project knowledge page. It is recorded as a pending proposal — never published — and creates no " +
      "work item. Set maturity to planned when the software it describes is not built yet.",
    parameters: {
      type: "object",
      properties: {
        project_slug_or_id: { type: "string", description: "Project id or slug" },
        slug: { type: "string", description: "Page slug, e.g. scheduled-reminders" },
        title: { type: "string", description: "Page title" },
        content_md: { type: "string", description: "Markdown body. State plainly what is not built." },
        maturity: {
          type: "string",
          enum: ["shipped", "planned"],
          description: "planned when the feature the page describes does not exist yet",
        },
      },
      required: ["project_slug_or_id", "slug", "title", "content_md", "maturity"],
    },
  },
};

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
  /**
   * `shipped` or `planned`.
   *
   * Optional here because most edits are to a page about shipped code. It is **required in practice** for a page
   * about software that does not exist yet: measured 2026-10-20 on suite 09's run `s09r3`, where the project lead
   * proposed a `roadmap` page whose own front matter said `planned` and the store recorded it `shipped`, so the
   * index and the body disagreed and the seat had to report the registry as wrong (BOARD F-120). The maturity
   * belongs to the content, so whoever proposes the content states it.
   */
  maturity?: "shipped" | "planned";
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
      maturity: args.maturity,
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
    description:
      "Propose a wiki page edit (Markdown). Requires project lead approval before publishing. Set maturity to " +
      "planned when the page describes software that does not exist yet — the index field and the body must agree.",
    parameters: {
      type: "object",
      properties: {
        agent_slug: { type: "string" },
        project_id: { type: "string" },
        page_slug: { type: "string" },
        content_md: { type: "string" },
        title: { type: "string" },
        maturity: {
          type: "string",
          enum: ["shipped", "planned"],
          description: "planned when the software the page describes does not exist yet",
        },
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

import { Hono } from "hono";
import type { AgentStore } from "../persistence/agent-store.js";
import type { PmStore } from "../persistence/pm-store.js";
import type { Store } from "../persistence/store.js";
import type { WikiStore } from "../persistence/wiki-store.js";
import {
  approveWikiEdit,
  createWikiPage,
  getWikiPageDetail,
  getWikiTree,
  listWikiPending,
  postWikiComment,
  proposeWikiEdit,
  rejectWikiEdit,
  updateWikiPageDirect,
  WikiServiceError,
} from "../application/wiki/wiki.js";

function wikiHttpStatus(code: WikiServiceError["code"]): 400 | 403 | 404 | 409 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    default:
      return 400;
  }
}

export function registerWikiRoutes(
  app: Hono,
  store: Store,
  pmStore: PmStore,
  wikiStore: WikiStore,
  agentStore: AgentStore,
) {
  app.get("/api/v1/projects/:idOrSlug/wiki", (c) => {
    try {
      return c.json(getWikiTree(store, pmStore, wikiStore, c.req.param("idOrSlug")));
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:idOrSlug/wiki/pending", (c) => {
    try {
      const agentSlug = c.req.query("agent_slug");
      return c.json({
        pages: listWikiPending(store, wikiStore, agentStore, c.req.param("idOrSlug"), agentSlug),
      });
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:idOrSlug/wiki/pages/:pageSlug", (c) => {
    try {
      return c.json(
        getWikiPageDetail(
          store,
          wikiStore,
          agentStore,
          c.req.param("idOrSlug"),
          c.req.param("pageSlug"),
        ),
      );
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/wiki/pages", async (c) => {
    const body = await c.req.json<{
      slug?: string;
      title?: string;
      content_md?: string;
      parent_id?: string;
      parent_slug?: string;
    }>();

    if (!body.slug?.trim() || !body.title?.trim()) {
      return c.json({ error: "slug and title are required" }, 400);
    }

    try {
      const page = createWikiPage(store, wikiStore, c.req.param("idOrSlug"), {
        slug: body.slug.trim(),
        title: body.title.trim(),
        contentMd: body.content_md,
        parentId: body.parent_id,
        parentSlug: body.parent_slug,
      });
      return c.json(page, 201);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.patch("/api/v1/wiki-pages/:id", async (c) => {
    const body = await c.req.json<{
      title?: string;
      content_md?: string;
      parent_id?: string;
      sort_order?: number;
    }>();

    try {
      const page = updateWikiPageDirect(store, wikiStore, c.req.param("id"), {
        title: body.title,
        contentMd: body.content_md,
        parentId: body.parent_id,
        sortOrder: body.sort_order,
      });
      return c.json(page);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/propose", async (c) => {
    const body = await c.req.json<{
      agent_slug?: string;
      title?: string;
      content_md?: string;
    }>();

    if (!body.agent_slug?.trim() || body.content_md === undefined) {
      return c.json({ error: "agent_slug and content_md are required" }, 400);
    }

    try {
      const page = proposeWikiEdit(
        store,
        wikiStore,
        agentStore,
        c.req.param("idOrSlug"),
        c.req.param("pageSlug"),
        {
          agentSlug: body.agent_slug.trim(),
          title: body.title,
          contentMd: body.content_md,
        },
      );
      return c.json(page);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/approve", async (c) => {
    const body = await c.req.json<{ agent_slug?: string }>();
    if (!body.agent_slug?.trim()) {
      return c.json({ error: "agent_slug is required" }, 400);
    }

    try {
      const page = approveWikiEdit(
        store,
        wikiStore,
        agentStore,
        c.req.param("idOrSlug"),
        c.req.param("pageSlug"),
        body.agent_slug.trim(),
      );
      return c.json(page);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/reject", async (c) => {
    const body = await c.req.json<{ agent_slug?: string }>();
    if (!body.agent_slug?.trim()) {
      return c.json({ error: "agent_slug is required" }, 400);
    }

    try {
      const page = rejectWikiEdit(
        store,
        wikiStore,
        agentStore,
        c.req.param("idOrSlug"),
        c.req.param("pageSlug"),
        body.agent_slug.trim(),
      );
      return c.json(page);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });

  app.post("/api/v1/projects/:idOrSlug/wiki/pages/:pageSlug/comments", async (c) => {
    const body = await c.req.json<{
      content?: string;
      agent_slug?: string;
      author_name?: string;
      parent_comment_id?: string;
    }>();

    if (!body.content?.trim()) {
      return c.json({ error: "content is required" }, 400);
    }

    try {
      const comment = postWikiComment(
        store,
        wikiStore,
        agentStore,
        c.req.param("idOrSlug"),
        c.req.param("pageSlug"),
        {
          content: body.content.trim(),
          agentSlug: body.agent_slug,
          authorName: body.author_name,
          parentCommentId: body.parent_comment_id,
        },
      );
      return c.json(comment, 201);
    } catch (error) {
      if (error instanceof WikiServiceError) {
        return c.json({ error: error.message, code: error.code }, wikiHttpStatus(error.code));
      }
      throw error;
    }
  });
}

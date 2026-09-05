import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { createDb } from "../src/persistence/db.js";
import { AgentStore } from "../src/persistence/agent-store.js";
import { PmStore } from "../src/persistence/pm-store.js";
import { WikiStore } from "../src/persistence/wiki-store.js";
import { Store } from "../src/persistence/store.js";
import {
  approveWikiEdit,
  getWikiPageDetail,
  getWikiTree,
  postWikiComment,
  proposeWikiEdit,
  rejectWikiEdit,
} from "../src/application/wiki/wiki.js";

describe("WikiStore", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function createFixture() {
    const dir = mkdtempSync(join(tmpdir(), "kampaku-wiki-"));
    dirs.push(dir);
    const { db } = createDb(join(dir, "test.db"));
    const agents = new AgentStore(db);
    const wiki = new WikiStore(db);
    const pm = new PmStore(db);
    const store = new Store(db);
    const now = new Date().toISOString();
    const projectId = uuidv4();
    store.createProject({
      id: projectId,
      slug: "demo",
      name: "Demo",
      status: "active",
      repositories: [],
      createdAt: now,
      updatedAt: now,
    });
    const lead = agents.createSubAgent({
      slug: "lead",
      name: "Lead",
      parentId: agents.getAgentBySlugOrId("kampaku")!.id,
      responsibilities: "Lead",
      systemPrompt: "Lead",
    });
    const writer = agents.createSubAgent({
      slug: "writer",
      name: "Writer",
      parentId: lead.id,
      responsibilities: "Writer",
      systemPrompt: "Writer",
    });
    store.updateProjectPlanning(projectId, { projectLeadAgentId: lead.id });
    return { agents, wiki, pm, store, projectId, lead, writer };
  }

  it("builds hierarchical pages with cross-links and comments", () => {
    const { agents, wiki, pm, store, projectId, lead, writer } = createFixture();

    const root = wiki.createPage({
      projectId,
      slug: "index",
      title: "Home",
      contentMd: "Welcome. See [[architecture|Architecture]].",
    });
    wiki.createPage({
      projectId,
      parentId: root.id,
      slug: "architecture",
      title: "Architecture",
      contentMd: "Back to [[index]].",
    });

    const tree = getWikiTree(store, pm, wiki, "demo");
    expect(tree.tree).toHaveLength(1);
    expect(tree.tree[0]?.children).toHaveLength(1);

    const detail = getWikiPageDetail(store, wiki, agents, "demo", "index");
    expect(detail.links[0]?.slug).toBe("architecture");
    expect(detail.links[0]?.exists).toBe(true);
    expect(detail.backlinks).toHaveLength(1);

    postWikiComment(store, wiki, agents, "demo", "index", {
      agentSlug: "writer",
      content: "Should we add deployment docs?",
    });

    const withComment = getWikiPageDetail(store, wiki, agents, "demo", "index");
    expect(withComment.comments).toHaveLength(1);
    expect(withComment.comments[0]?.comment.content).toContain("deployment");

    proposeWikiEdit(store, wiki, agents, "demo", "index", {
      agentSlug: "writer",
      contentMd: "Updated home with [[architecture]].",
    });

    const pending = getWikiPageDetail(store, wiki, agents, "demo", "index");
    expect(pending.page.status).toBe("pending_approval");
    expect(pending.pendingEdit?.contentMd).toContain("Updated");

    expect(() =>
      approveWikiEdit(store, wiki, agents, "demo", "index", "writer"),
    ).toThrow(/project lead/i);

    const approved = approveWikiEdit(store, wiki, agents, "demo", "index", "lead");
    expect(approved.contentMd).toContain("Updated home");
    expect(approved.status).toBe("published");
  });

  it("rejects pending edits", () => {
    const { agents, wiki, pm, store, projectId, writer } = createFixture();
    wiki.createPage({ projectId, slug: "guide", title: "Guide", contentMd: "v1" });

    proposeWikiEdit(store, wiki, agents, "demo", "guide", {
      agentSlug: "writer",
      contentMd: "v2",
    });

    rejectWikiEdit(store, wiki, agents, "demo", "guide", "lead");
    const page = wiki.getPageBySlug(projectId, "guide");
    expect(page?.contentMd).toBe("v1");
    expect(page?.status).toBe("published");
  });
});

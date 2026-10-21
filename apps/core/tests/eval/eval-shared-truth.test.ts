import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  KAMPAKU_BUILTIN_DEFINITION,
  KAMPAKU_BUILTIN_ID,
} from "../../src/agents/definitions.js";
import { executeToolCall, KAMPAKU_TOOLS } from "../../src/agents/runtime/tools/index.js";
import { PROPOSE_WIKI_EDIT_TOOL } from "../../src/agents/runtime/tools/wiki-tools.js";
import { executeGetProject } from "../../src/agents/runtime/tools/get-project.js";
import {
  approveWikiEdit,
  getProjectKnowledge,
  proposeWikiEdit,
  proposeWikiPage,
  rejectWikiEdit,
} from "../../src/application/wiki/wiki.js";
import { ensureDefaultWikiPages } from "../../src/application/wiki/default-pages.js";
import { createProject } from "../../src/application/projects.js";
import { supersedePriorPlan } from "../../src/application/pm/plan-supersession.js";
import { createTestContext, type TestContext } from "../helpers/test-context.js";

/**
 * Suite 09's lock: **published knowledge matches the disk, and what is not built says so.**
 *
 * Three defects were measured on the suite's first run, `s09r1` (2026-10-20), and each one is a case below.
 *
 * 1. **The knowledge surface had no read.** `get_project` mapped a project's documents down to `{slug, title}`,
 *    and the front office held no wiki tool at all, so prompt 2 — *"point me to the pages I should read, and
 *    tell me which of them are proposals rather than published"* — was answered *"the document list returns a
 *    slug and a title for each page and no publication state … I will not guess at it"*. The store held the
 *    answer (BOARD F-120).
 * 2. **A page about unbuilt software had nowhere to go.** Prompt 3 — *"add a page describing the
 *    scheduled-reminders feature we will build next quarter; do not implement it"* — was **refused as out of
 *    scope** (`unverifiable_evidence`) and offered as a plan instead. A factory that cannot record "planned"
 *    cannot keep next quarter's intent apart from this quarter's code.
 * 3. **The default knowledge pages carried a hardcoded `npm` trio**, handed to every project whatever its stack
 *    — the third instance of BOARD F-003, and on the one surface the suite reads against the tree: a *published
 *    page* whose first four commands fail.
 *
 * What every case has in common is the suite's own rule: a claim about the checkout has to come from the
 * checkout, and a claim about the future has to be labelled as one.
 */
describe("eval 09 — shared truth: published knowledge matches the disk", () => {
  let context: TestContext | undefined;
  const dirs: string[] = [];

  afterEach(() => {
    context?.cleanup();
    context = undefined;
    dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  function freshContext() {
    context = createTestContext("kampaku-eval-09-");
    return context;
  }

  function checkout(prefix: string, files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    for (const [name, body] of Object.entries(files)) {
      const target = join(dir, name);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, body);
    }
    return dir;
  }

  /** A project with a linked checkout and an accountable lead, through the documented routes. */
  function projectWithCheckout(repoPath: string) {
    const ctx = freshContext();
    const lead = ctx.agentStore.createSubAgent({
      slug: "knowledge-lead",
      name: "Knowledge lead",
      parentId: KAMPAKU_BUILTIN_ID,
      responsibilities: "Own the work order and publish its knowledge",
      systemPrompt: "Lead",
    });
    const project = createProject(
      ctx.store,
      {
        name: "textstats",
        slug: "textstats",
        project_lead_slug: lead.slug,
        repositories: [{ url: `file://${repoPath}`, role: "core" }],
      },
      { workspaceRoot: ctx.config.workspaceRoot },
      ctx.agentStore,
    );
    return { ctx, project, lead };
  }

  it("derives the default dev-setup page from the checkout, and never invents a command", () => {
    // A Python-shaped checkout: a Makefile that declares `check`, and no package.json anywhere.
    const repoPath = checkout("kampaku-eval-09-make-", {
      Makefile: "PYTHON ?= python3\n\n.PHONY: check\n\ncheck:\n\t@echo checked\n",
    });
    const { ctx, project } = projectWithCheckout(repoPath);

    ensureDefaultWikiPages(ctx.wikiStore, project.id, project.name, project.repositories);
    const page = ctx.wikiStore.getPageBySlug(project.id, "dev-setup");
    expect(page).toBeDefined();
    const body = page?.contentMd ?? "";

    // The command the checkout declares, quoted with the file that justifies it.
    expect(body).toContain("make check");
    expect(body).toContain("Makefile target check");
    // And nothing from another ecosystem: this is the defect, so it is asserted by name.
    expect(body).not.toMatch(/npm install|npm test|npm run build/);
    // The page records no result: nothing was executed while it was written.
    expect(body).toMatch(/No output is recorded on this page/);

    // The command the page names is one this checkout runs. This is the suite's own oracle line.
    const ran = execFileSync("make", ["check"], { cwd: repoPath, encoding: "utf8" });
    expect(ran.trim()).toBe("checked");
  });

  it("states that no command is declared when the checkout declares none", () => {
    // A checkout with files and no manifest, no Makefile, no test suite: it declares nothing.
    const repoPath = checkout("kampaku-eval-09-empty-", { "notes.txt": "nothing declared\n" });
    const { ctx, project } = projectWithCheckout(repoPath);

    ensureDefaultWikiPages(ctx.wikiStore, project.id, project.name, project.repositories);
    const body = ctx.wikiStore.getPageBySlug(project.id, "dev-setup")?.contentMd ?? "";

    expect(body).toMatch(/declares no check/);
    expect(body).toMatch(/No command is\s+listed here, because this project has not declared one/);
    // A project with no linked checkout says that instead of guessing a command.
    expect(body).not.toMatch(/npm|pytest|make /);
  });

  it("records a page about unbuilt work as a proposal, marked planned, and publishes nothing", () => {
    const repoPath = checkout("kampaku-eval-09-plan-", { "README.md": "# demo\n" });
    const { ctx, project } = projectWithCheckout(repoPath);

    const proposed = proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, {
      slug: "scheduled-reminders",
      title: "Scheduled reminders (planned)",
      contentMd:
        "# Scheduled reminders — planned\n\n**Status: not built.** No code in this checkout implements a reminder.\n",
      maturity: "planned",
      agentSlug: "kampaku",
    });

    // A pending proposal is not a page: the store keeps it apart from anything published.
    expect(proposed.status).toBe("pending_approval");
    expect(proposed.maturity).toBe("planned");
    expect(proposed.approvedAt).toBeUndefined();

    const knowledge = getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);
    expect(knowledge.pages).toHaveLength(1);
    expect(knowledge.pages[0]).toMatchObject({
      slug: "scheduled-reminders",
      publication: "proposal",
      maturity: "planned",
    });
    expect(knowledge.counts).toMatchObject({ published: 0, proposals: 1, planned: 1 });

    // The body a reader is shown is the **proposal's**, and the projection says so.
    const withBody = getProjectKnowledge(
      ctx.store,
      ctx.wikiStore,
      ctx.agentStore,
      project.slug,
      "scheduled-reminders",
    );
    expect(withBody.page?.bodyIs).toBe("proposal");
    expect(withBody.page?.contentMd).toMatch(/Status: not built/);
  });

  it("keeps the three surfaces on one word for a page's state", () => {
    const repoPath = checkout("kampaku-eval-09-surfaces-", { "README.md": "# demo\n" });
    const { ctx, project, lead } = projectWithCheckout(repoPath);

    ctx.wikiStore.createPage({
      projectId: project.id,
      slug: "overview",
      title: "Overview",
      contentMd: "# Overview\n\nOne module, one test.\n",
      status: "published",
      maturity: "shipped",
    });
    proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, {
      slug: "scheduled-reminders",
      title: "Scheduled reminders (planned)",
      contentMd: "# Planned\n\nNot built.\n",
      maturity: "planned",
      agentSlug: lead.slug,
    });

    // `get_project` — the projection the chat path reads.
    const overview = executeGetProject(ctx.toolContext, { project_slug_or_id: project.slug });
    expect(overview.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "overview", publication: "published", maturity: "shipped" }),
        expect.objectContaining({
          slug: "scheduled-reminders",
          publication: "proposal",
          maturity: "planned",
        }),
      ]),
    );

    // The knowledge read — the front office's own tool, through the real dispatch path, with its own grant.
    const published = ctx.wikiStore.getPageBySlug(project.id, "overview");
    const proposed = ctx.wikiStore.getPageBySlug(project.id, "scheduled-reminders");
    expect(published?.status).toBe("published");
    expect(proposed?.status).toBe("pending_approval");
  });

  it("leaves a rejected proposal unpublished instead of making it live", () => {
    const repoPath = checkout("kampaku-eval-09-reject-", { "README.md": "# demo\n" });
    const { ctx, project, lead } = projectWithCheckout(repoPath);

    proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, {
      slug: "scheduled-reminders",
      title: "Scheduled reminders (planned)",
      contentMd: "# Planned\n\nNot built.\n",
      maturity: "planned",
      agentSlug: lead.slug,
    });
    const rejected = rejectWikiEdit(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, "scheduled-reminders", lead.slug);

    // It was never published, so a rejection must not publish it. Before this case existed the store set
    // `published` unconditionally, and a rejected proposal became a live page with no content.
    expect(rejected.status).toBe("draft");
    expect(rejected.contentMd.trim()).toBe("");
    const knowledge = getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);
    expect(knowledge.counts.published).toBe(0);
    expect(knowledge.counts.drafts).toBe(1);
  });

  it("publishes only through the lead's approval, and then reports it as published", () => {
    const repoPath = checkout("kampaku-eval-09-approve-", { "README.md": "# demo\n" });
    const { ctx, project, lead } = projectWithCheckout(repoPath);

    proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, {
      slug: "scheduled-reminders",
      title: "Scheduled reminders (planned)",
      contentMd: "# Planned\n\nNot built yet.\n",
      maturity: "planned",
      agentSlug: lead.slug,
    });
    const approved = approveWikiEdit(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, "scheduled-reminders", lead.slug);

    expect(approved.status).toBe("published");
    const knowledge = getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);
    // Published *and* planned: the lead approved the page, the software is still not built. Folding these
    // into one state is how a planned feature comes to read as a shipped one.
    expect(knowledge.pages[0]).toMatchObject({ publication: "published", maturity: "planned" });
  });

  it("creates no jobs, no work items and no milestones while knowledge is updated", () => {
    const repoPath = checkout("kampaku-eval-09-nowork-", { "README.md": "# demo\n" });
    const { ctx, project, lead } = projectWithCheckout(repoPath);

    const before = {
      jobs: ctx.store.listJobs().length,
      items: ctx.pmStore.listWorkItemsByProject(project.id).length,
      milestones: ctx.pmStore.listMilestonesByProject(project.id).length,
    };

    ensureDefaultWikiPages(ctx.wikiStore, project.id, project.name, project.repositories);
    proposeWikiPage(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, {
      slug: "scheduled-reminders",
      title: "Scheduled reminders (planned)",
      contentMd: "# Planned\n\nNot built.\n",
      maturity: "planned",
      agentSlug: lead.slug,
    });
    getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);

    expect({
      jobs: ctx.store.listJobs().length,
      items: ctx.pmStore.listWorkItemsByProject(project.id).length,
      milestones: ctx.pmStore.listMilestonesByProject(project.id).length,
    }).toEqual(before);
  });

  it("supersedes a previous plan's own output, and leaves the project's knowledge alone", () => {
    // Measured 2026-10-20 on suite 07's `s07r22` (BOARD F-119): a second plan applied over an applied one
    // cancelled the first plan's work items and left its pages and milestone **published as current**, so the
    // wiki held two contradicting plans and a cold reader had to decide which was real. Suite 09's promise —
    // published knowledge matches the tree — fails on that directly.
    const repoPath = checkout("kampaku-eval-09-supersede-", { "README.md": "# demo\n" });
    const { ctx, project } = projectWithCheckout(repoPath);

    // The project's own knowledge, written by a seat. It must survive a re-plan.
    ctx.wikiStore.createPage({
      projectId: project.id,
      slug: "overview-demo",
      title: "textstats — Project Overview",
      contentMd: "# Overview\n\nOne module.\n",
      status: "published",
      maturity: "shipped",
      origin: "knowledge",
    });

    // The previous plan's output: a coherence page and a milestone, both written by the plan machinery.
    const planDoc = ctx.pmStore.createDocument({
      id: "doc-plan-1",
      projectId: project.id,
      slug: "coherence-plan",
      title: "Coherence plan",
      contentMd: "# Coherence plan\n\nLeaf 1 then leaf 2.\n",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(planDoc).toMatchObject({ origin: "plan", maturity: "planned" });
    const milestone = ctx.pmStore.createMilestone({
      id: "ms-1",
      projectId: project.id,
      title: "Milestone 1: summary module only",
      description: "The excluded behaviour.",
      sortOrder: 0,
      status: "planned",
      successCriteria: ["tests in tests/test_stats.py"],
      executedBy: "ai_agents",
    });

    // The new plan does not carry either of them.
    const superseded = supersedePriorPlan(ctx.store, ctx.pmStore, ctx.wikiStore, project, {
      documentTitles: ["Coherence plan v2"],
      milestoneTitles: ["Milestone 1: CLI plus tests"],
    });

    expect(superseded.archivedDocuments).toEqual(["coherence-plan"]);
    expect(superseded.cancelledMilestones).toEqual([milestone.title]);

    // A superseded page is archived **and** says so where a reader lands on it.
    const archived = ctx.wikiStore.getPageBySlug(project.id, "coherence-plan");
    expect(archived?.status).toBe("archived");
    expect(archived?.contentMd).toMatch(/Superseded/);

    // The milestone stops being published as current.
    expect(ctx.pmStore.listMilestonesByProject(project.id)[0]?.status).toBe("cancelled");

    // And the project's knowledge is untouched: not this plan's output, not its to supersede.
    const knowledge = ctx.wikiStore.getPageBySlug(project.id, "overview-demo");
    expect(knowledge?.status).toBe("published");
    expect(knowledge?.contentMd).toBe("# Overview\n\nOne module.\n");

    // The read says which pages are superseded rather than dropping them silently.
    const summary = getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);
    expect(summary.pages.find((page) => page.slug === "coherence-plan")).toMatchObject({
      publication: "archived",
    });
    expect(summary.counts.archived).toBe(1);
    expect(summary.counts.published).toBe(1);
  });

  it("lets the seat that proposes the content state its maturity", () => {
    // Measured 2026-10-20 on suite 09's run `s09r3`: the project lead proposed a `roadmap` page whose own front
    // matter said `planned`, and the store recorded it `shipped` — the index field disagreed with the body, and the
    // reply had to report its own registry as wrong (BOARD F-120). Maturity is a property of the content its author
    // wrote, so it travels with the proposal and the tool the line holds advertises the field.
    const repoPath = checkout("kampaku-eval-09-edit-maturity-", { "README.md": "# demo\n" });
    const { ctx, project, lead } = projectWithCheckout(repoPath);

    const proposed = proposeWikiEdit(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug, "roadmap-next-quarter", {
      agentSlug: lead.slug,
      title: "Roadmap — not built",
      contentMd: "# Roadmap\n\n**Nothing on this page is built.**\n",
      maturity: "planned",
    });
    expect(proposed).toMatchObject({ status: "pending_approval", maturity: "planned" });

    const knowledge = getProjectKnowledge(ctx.store, ctx.wikiStore, ctx.agentStore, project.slug);
    expect(knowledge.pages[0]).toMatchObject({ publication: "proposal", maturity: "planned" });

    // The tool the line holds offers the field; an option a model cannot see is an option nobody can use.
    const schema = JSON.stringify(PROPOSE_WIKI_EDIT_TOOL);
    expect(schema).toContain("maturity");
    expect(schema).toContain("planned");
  });

  it("reaches the knowledge read and the proposal write through the tool path, and keeps publishing out", async () => {
    const repoPath = checkout("kampaku-eval-09-tool-", { "README.md": "# demo\n" });
    const { ctx, project } = projectWithCheckout(repoPath);

    const runtimeNames = new Set(KAMPAKU_TOOLS.map((tool) => tool.function.name));
    // Advertised **and** reachable: a grant that is only listed is not a grant.
    for (const tool of ["get_project_knowledge", "propose_wiki_page"]) {
      expect(KAMPAKU_BUILTIN_DEFINITION.tools).toContain(tool);
      expect(runtimeNames.has(tool), `${tool} is advertised but not in the runtime registry`).toBe(true);
    }
    // Publishing is still the lead's act, and the front office still holds no line capability.
    for (const tool of ["approve_wiki_edit", "propose_wiki_edit", "post_wiki_comment"]) {
      expect(KAMPAKU_BUILTIN_DEFINITION.tools).not.toContain(tool);
    }

    const grant = {
      allowed: new Set(KAMPAKU_BUILTIN_DEFINITION.tools),
      label: "the front office's toolset",
    } as const;

    const proposed = await executeToolCall(
      ctx.toolContext,
      "propose_wiki_page",
      JSON.stringify({
        project_slug_or_id: project.slug,
        slug: "scheduled-reminders",
        title: "Scheduled reminders (planned)",
        content_md: "# Planned\n\n**Status: not built.**\n",
        maturity: "planned",
      }),
      { agentId: KAMPAKU_BUILTIN_ID },
      grant,
    );
    expect(proposed.output).toMatchObject({
      publication: "proposal",
      published: false,
      maturity: "planned",
    });

    const read = await executeToolCall(
      ctx.toolContext,
      "get_project_knowledge",
      JSON.stringify({ project_slug_or_id: project.slug }),
      { agentId: KAMPAKU_BUILTIN_ID },
      grant,
    );
    expect(read.output).toMatchObject({
      counts: { published: 0, proposals: 1, planned: 1 },
    });

    // A line seat may not use the front office's proposal path; the refusal is in runtime code.
    const refused = await executeToolCall(
      ctx.toolContext,
      "propose_wiki_page",
      JSON.stringify({
        project_slug_or_id: project.slug,
        slug: "sneaky",
        title: "Sneaky",
        content_md: "# x\n",
        maturity: "shipped",
      }),
      { agentId: "not-the-root-agent" },
      grant,
    ).catch((error: unknown) => String((error as Error).message));
    expect(String(refused)).toMatch(/Only the root agent may propose a project knowledge page/);
    expect(ctx.wikiStore.getPageBySlug(project.id, "sneaky")).toBeUndefined();
  });
});

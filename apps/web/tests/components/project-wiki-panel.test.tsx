import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWikiPanel } from "@/components/projects/project-wiki-panel";

const { getWikiPage, getWikiTree, getProjectOverview, approveWikiPage, rejectWikiPage } = vi.hoisted(() => ({
  getWikiPage: vi.fn(),
  getWikiTree: vi.fn(),
  getProjectOverview: vi.fn(),
  approveWikiPage: vi.fn(),
  rejectWikiPage: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getWikiPage,
  getWikiTree,
  getProjectOverview,
  approveWikiPage,
  rejectWikiPage,
  postWikiComment: vi.fn(),
}));

const homePage = {
  id: "page-home",
  projectId: "project-1",
  parentPageId: null,
  slug: "home",
  title: "Home",
  contentMd: "Welcome",
  status: "published",
  sortOrder: 0,
};

const guidePage = {
  ...homePage,
  id: "page-guide",
  parentPageId: "page-home",
  slug: "guide",
  title: "Guide",
  contentMd: "Guide content",
};

describe("ProjectWikiPanel responsive navigation", () => {
  beforeEach(() => {
    getWikiTree.mockReset();
    getWikiPage.mockReset();
    getProjectOverview.mockReset();
    approveWikiPage.mockReset();
    rejectWikiPage.mockReset();
    // The project's **linked lead**, which is the only role the Core authorises to publish. The panel reads it
    // rather than assuming it: `assertProjectLead` refuses anything else, and a guessed slug would be refused with
    // a sentence the operator cannot act on.
    getProjectOverview.mockResolvedValue({
      project: { id: "project-1", slug: "demo", name: "Demo", projectLeadSlug: "demo-lead" },
      documents: [],
      milestones: [],
      workItems: [],
    });
    getWikiTree.mockResolvedValue({
      tree: [{ page: homePage, children: [{ page: guidePage, children: [] }] }],
      pendingCount: 0,
    });
    getWikiPage.mockImplementation(async (_project: string, slug: string) => ({
      page: slug === "guide" ? guidePage : homePage,
      links: [],
      backlinks: [],
      comments: [],
      pendingEdit: null,
    }));
  });

  it("keeps the page hierarchy in the mobile selector and navigates with it", async () => {
    const user = userEvent.setup();
    render(<ProjectWikiPanel projectSlug="demo" />);

    const selector = await screen.findByRole("combobox", { name: "Pages" });
    expect(screen.getByRole("option", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "— Guide" })).toBeInTheDocument();

    await user.selectOptions(selector, "guide");

    await waitFor(() => expect(getWikiPage).toHaveBeenCalledWith("demo", "guide"));
    expect(await screen.findByRole("heading", { name: "Guide" })).toBeInTheDocument();
  });
});

/**
 * Suite 16, journey 4: *find a pending proposal, and approve or reject it from the UI as the authorized role*.
 *
 * The panel rendered a pending edit as read-only text until this control existed, so the decision belonged to the
 * CLI alone — the operator friction the suite's oracle names (*"a gate can only be answered in the terminal"*).
 *
 * The lock is on both halves of what makes the control honest: it posts **the project's linked lead**, read from
 * the project, and the sentence it shows afterwards is built from the record the server returned rather than from
 * the click.
 */
describe("ProjectWikiPanel pending decisions", () => {
  const proposal = {
    id: "page-proposal",
    projectId: "project-1",
    parentPageId: null,
    slug: "proposal",
    title: "Proposal",
    contentMd: "",
    status: "pending_approval",
    sortOrder: 0,
  };

  beforeEach(() => {
    getWikiPage.mockReset();
    getWikiTree.mockReset();
    getProjectOverview.mockReset();
    approveWikiPage.mockReset();
    rejectWikiPage.mockReset();
    getProjectOverview.mockResolvedValue({
      project: { id: "project-1", slug: "demo", name: "Demo", projectLeadSlug: "demo-lead" },
      documents: [],
      milestones: [],
      workItems: [],
    });
    getWikiTree.mockResolvedValue({ tree: [{ page: proposal, children: [] }], pendingCount: 1 });
    getWikiPage.mockImplementation(async () => ({
      page: proposal,
      links: [],
      backlinks: [],
      comments: [],
      publication: "proposal",
      pendingEdit: { contentMd: "# Proposed body", proposedBySlug: "demo-lead" },
    }));
  });

  it("approves a proposal as the project's linked lead, and reports what the store answered", async () => {
    const user = userEvent.setup();
    approveWikiPage.mockResolvedValue({ ...proposal, status: "published" });
    render(<ProjectWikiPanel projectSlug="demo" />);

    const decision = await screen.findByTestId("wiki-pending-decision");
    // The proposal is readable, and the deciding role is named rather than left to the operator to guess.
    expect(decision).toHaveTextContent("# Proposed body");
    expect(decision).toHaveTextContent("decides: demo-lead");

    await user.click(within(decision).getByRole("button", { name: "Approve" }));

    // The authorised role, and the page it was about.
    await waitFor(() => expect(approveWikiPage).toHaveBeenCalledWith("demo", "proposal", "demo-lead"));
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent("Approved by demo-lead");
    expect(note).toHaveTextContent("is published");
  });

  it("rejects a proposal and says it was not published", async () => {
    const user = userEvent.setup();
    rejectWikiPage.mockResolvedValue({ ...proposal, status: "draft" });
    render(<ProjectWikiPanel projectSlug="demo" />);

    const decision = await screen.findByTestId("wiki-pending-decision");
    await user.click(within(decision).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(rejectWikiPage).toHaveBeenCalledWith("demo", "proposal", "demo-lead"));
    expect(await screen.findByRole("status")).toHaveTextContent("was not published");
  });

  it("offers no control, and says why, when the project has no linked lead", async () => {
    getProjectOverview.mockResolvedValue({
      project: { id: "project-1", slug: "demo", name: "Demo", projectLeadSlug: null },
      documents: [],
      milestones: [],
      workItems: [],
    });
    render(<ProjectWikiPanel projectSlug="demo" />);

    const decision = await screen.findByTestId("wiki-pending-decision");
    await waitFor(() => expect(decision).not.toHaveTextContent("decides:"));
    expect(decision).not.toHaveTextContent("Deciding…");
    expect(decision).toHaveTextContent("only a project lead can publish a page");
    expect(decision).toHaveTextContent("kampaku projects update demo --lead");
  });
});

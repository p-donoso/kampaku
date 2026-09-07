import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWikiPanel } from "./project-wiki-panel";

const {
  getWikiPage,
  getWikiTree,
  getProjectOverview,
  listAgents,
  approveWikiEdit,
  rejectWikiEdit,
} = vi.hoisted(() => ({
  getWikiPage: vi.fn(),
  getWikiTree: vi.fn(),
  getProjectOverview: vi.fn(),
  listAgents: vi.fn(),
  approveWikiEdit: vi.fn(),
  rejectWikiEdit: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getWikiPage,
  getWikiTree,
  postWikiComment: vi.fn(),
  getProjectOverview,
  listAgents,
  approveWikiEdit,
  rejectWikiEdit,
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
    listAgents.mockReset();
    approveWikiEdit.mockReset();
    rejectWikiEdit.mockReset();
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

  it("approves a pending wiki edit via the project lead", async () => {
    const user = userEvent.setup();
    getWikiTree.mockResolvedValue({
      tree: [{ page: { ...homePage, status: "pending_approval" }, children: [] }],
      pendingCount: 1,
    });
    getWikiPage.mockResolvedValue({
      page: homePage,
      links: [],
      backlinks: [],
      comments: [],
      pendingEdit: {
        contentMd: "Proposed content",
        proposedBySlug: "demo-frontend",
      },
    });
    getProjectOverview.mockResolvedValue({
      project: { id: "project-1", slug: "demo", name: "Demo", projectLeadAgentId: "lead-1" },
      documents: [],
      milestones: [],
      workItems: [],
    });
    listAgents.mockResolvedValue({
      tree: [
        {
          agent: { id: "lead-1", slug: "demo-lead", name: "Lead", parentId: null },
          children: [],
        },
      ],
    });
    approveWikiEdit.mockResolvedValue({ id: "page-home", slug: "home", status: "published", contentMd: "Proposed content" });

    render(<ProjectWikiPanel projectSlug="demo" />);
    await expect(screen.findByText("Pending edit")).resolves.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve edit/i }));
    await waitFor(() =>
      expect(approveWikiEdit).toHaveBeenCalledWith("demo", "home", "demo-lead"),
    );
  });
});

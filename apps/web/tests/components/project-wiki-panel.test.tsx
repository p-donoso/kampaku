import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWikiPanel } from "@/components/projects/project-wiki-panel";

const { getWikiPage, getWikiTree } = vi.hoisted(() => ({
  getWikiPage: vi.fn(),
  getWikiTree: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getWikiPage,
  getWikiTree,
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

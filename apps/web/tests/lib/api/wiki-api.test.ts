import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getWikiTree,
  getWikiPage,
  postWikiComment,
  updateProjectDocument,
} from "../../../src/lib/api/wiki";

describe("wiki API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getWikiTree fetches wiki tree for project", async () => {
    const mockTree = { pages: [{ slug: "home", title: "Home" }] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockTree,
    });

    const result = await getWikiTree("test-project");
    expect(result).toEqual(mockTree);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/projects/test-project/wiki",
      expect.any(Object)
    );
  });

  it("getWikiPage fetches single page detail", async () => {
    const mockPage = { slug: "test-page", title: "Test", content: "Content" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockPage,
    });

    const result = await getWikiPage("test-project", "test-page");
    expect(result).toEqual(mockPage);
  });

  it("postWikiComment posts comment on page", async () => {
    const mockComment = { id: "comment-1", content: "Test comment", createdAt: "2026-01-01" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockComment,
    });

    const result = await postWikiComment("test-project", "test-page", { content: "Test comment" });
    expect(result).toEqual(mockComment);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/wiki/pages/test-page/comments"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("updateProjectDocument sends PATCH request", async () => {
    const mockUpdated = { id: "doc-1", slug: "test", title: "Updated", contentMd: "New content" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateProjectDocument("doc-1", { title: "Updated" });
    expect(result).toEqual(mockUpdated);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/project-documents/doc-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

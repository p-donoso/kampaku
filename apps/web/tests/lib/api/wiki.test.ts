import { describe, it, expect, vi, beforeEach } from "vitest";
import * as wikiApi from "@/lib/api/wiki";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  fetchJson: vi.fn(),
  getBaseUrl: vi.fn(() => "http://localhost:3000"),
}));

describe("wiki API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWikiTree", () => {
    it("fetches wiki tree for project", async () => {
      const mockData = { pages: [], roots: [] };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await wikiApi.getWikiTree("my-project");

      expect(client.fetchJson).toHaveBeenCalledWith("/api/v1/projects/my-project/wiki");
      expect(result).toEqual(mockData);
    });

    it("encodes project slug", async () => {
      vi.mocked(client.fetchJson).mockResolvedValueOnce({ pages: [], roots: [] });

      await wikiApi.getWikiTree("project with spaces");

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/projects/project%20with%20spaces/wiki"
      );
    });
  });

  describe("getWikiPage", () => {
    it("fetches wiki page detail", async () => {
      const mockData = {
        page: { id: "1", slug: "intro", title: "Introduction", contentMd: "# Intro" },
        comments: [],
      };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      const result = await wikiApi.getWikiPage("my-project", "intro");

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/projects/my-project/wiki/pages/intro"
      );
      expect(result).toEqual(mockData);
    });

    it("encodes slugs", async () => {
      const mockData = { page: {}, comments: [] };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockData);

      await wikiApi.getWikiPage("my project", "page-with-special/chars");

      expect(client.fetchJson).toHaveBeenCalledWith(
        expect.stringContaining("my%20project"),
      );
      expect(client.fetchJson).toHaveBeenCalledWith(
        expect.stringContaining("page-with-special%2Fchars"),
      );
    });
  });

  describe("postWikiComment", () => {
    it("posts comment to wiki page", async () => {
      const mockComment = { id: "comment-1", content: "Great page", createdAt: "2025-01-15T10:00:00Z" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockComment);

      const result = await wikiApi.postWikiComment("proj", "page", {
        content: "Great page",
        author_name: "Alice",
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/projects/proj/wiki/pages/page/comments",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Great page"),
        }),
      );
      expect(result).toEqual(mockComment);
    });

    it("includes optional parent_comment_id", async () => {
      vi.mocked(client.fetchJson).mockResolvedValueOnce({ id: "c1", content: "", createdAt: "" });

      await wikiApi.postWikiComment("proj", "page", {
        content: "Reply",
        parent_comment_id: "parent-123",
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("parent-123"),
        }),
      );
    });
  });

  describe("updateProjectDocument", () => {
    it("updates document title and content", async () => {
      const mockDoc = { id: "doc-1", slug: "updated", title: "Updated Title", contentMd: "New content" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockDoc);

      const result = await wikiApi.updateProjectDocument("doc-1", {
        title: "Updated Title",
        content_md: "New content",
      });

      expect(client.fetchJson).toHaveBeenCalledWith(
        "/api/v1/project-documents/doc-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("Updated Title"),
        }),
      );
      expect(result).toEqual(mockDoc);
    });

    it("updates only title", async () => {
      const mockDoc = { id: "doc-1", slug: "doc", title: "New Title", contentMd: "" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockDoc);

      await wikiApi.updateProjectDocument("doc-1", { title: "New Title" });

      expect(client.fetchJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("New Title"),
        }),
      );
    });

    it("updates only content", async () => {
      const mockDoc = { id: "doc-1", slug: "doc", title: "", contentMd: "Updated" };
      vi.mocked(client.fetchJson).mockResolvedValueOnce(mockDoc);

      await wikiApi.updateProjectDocument("doc-1", { content_md: "Updated" });

      expect(client.fetchJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("Updated"),
        }),
      );
    });
  });
});

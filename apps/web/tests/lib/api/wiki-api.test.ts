import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  listWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
} from "../../../src/lib/api/wiki";

describe("wiki API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listWikiPages fetches all pages", async () => {
    const mockPages = [{ id: "page-1", slug: "test-page" }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ pages: mockPages }),
    });

    const result = await listWikiPages();
    expect(result.pages).toEqual(mockPages);
  });

  it("getWikiPage fetches single page", async () => {
    const mockPage = { id: "page-1", slug: "test-page", content: "Test" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockPage,
    });

    const result = await getWikiPage("test-page");
    expect(result).toEqual(mockPage);
  });

  it("createWikiPage posts new page", async () => {
    const mockPage = { id: "page-new", slug: "new-page" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockPage,
    });

    const result = await createWikiPage({ slug: "new-page", title: "New", content: "Test" });
    expect(result).toEqual(mockPage);
  });

  it("updateWikiPage sends PATCH request", async () => {
    const mockUpdated = { id: "page-1", content: "Updated" };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockUpdated,
    });

    const result = await updateWikiPage("page-1", { content: "Updated" });
    expect(result).toEqual(mockUpdated);
  });

  it("deleteWikiPage sends DELETE request", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    await deleteWikiPage("page-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/wiki/pages/page-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

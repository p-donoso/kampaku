import { describe, it, expect } from "vitest";
import {
  extractWikiLinks,
  resolveWikiLinks,
  buildPagesBySlug,
} from "../../../src/application/wiki/cross-refs.js";
import type { WikiPageRecord } from "../../../src/persistence/wiki-store.js";

describe("wiki cross-refs", () => {
  const mockPage = (overrides: Partial<WikiPageRecord> = {}): WikiPageRecord => ({
    id: "page-1",
    projectId: "proj-1",
    slug: "test-page",
    title: "Test Page",
    status: "published",
    contentMd: "",
    authorAgentId: "agent-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  describe("extractWikiLinks", () => {
    it("extracts simple wiki links", () => {
      const content = "See [[page-a]] and [[page-b]]";
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(2);
      expect(links[0].slug).toBe("page-a");
      expect(links[1].slug).toBe("page-b");
    });

    it("extracts wiki links with labels", () => {
      const content = "See [[page-a|Link A]] and [[page-b|Link B]]";
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(2);
      expect(links[0]).toEqual({ slug: "page-a", label: "Link A" });
      expect(links[1]).toEqual({ slug: "page-b", label: "Link B" });
    });

    it("deduplicates repeated links", () => {
      const content = "[[page-a]] and [[page-a]] again";
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0].slug).toBe("page-a");
    });

    it("trims whitespace from slugs and labels", () => {
      const content = "[[ page-a  |  Label  ]]";
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({ slug: "page-a", label: "Label" });
    });

    it("returns empty array for content without links", () => {
      const content = "No wiki links here";
      expect(extractWikiLinks(content)).toEqual([]);
    });

    it("handles multiline content", () => {
      const content = `
        First [[page-a]]
        Second [[page-b]]
      `;
      const links = extractWikiLinks(content);
      expect(links).toHaveLength(2);
    });
  });

  describe("resolveWikiLinks", () => {
    it("resolves existing published pages", () => {
      const content = "See [[page-a]]";
      const pagesBySlug = new Map([
        ["page-a", mockPage({ slug: "page-a", title: "Page A", status: "published" })],
      ]);
      const resolved = resolveWikiLinks(content, pagesBySlug);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        slug: "page-a",
        title: "Page A",
        exists: true,
      });
    });

    it("marks draft pages as non-existent", () => {
      const content = "See [[draft-page]]";
      const pagesBySlug = new Map([
        ["draft-page", mockPage({ slug: "draft-page", status: "draft" })],
      ]);
      const resolved = resolveWikiLinks(content, pagesBySlug);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].exists).toBe(false);
    });

    it("marks missing pages as non-existent", () => {
      const content = "See [[missing-page]]";
      const pagesBySlug = new Map<string, WikiPageRecord>();
      const resolved = resolveWikiLinks(content, pagesBySlug);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]).toMatchObject({
        slug: "missing-page",
        exists: false,
        title: undefined,
      });
    });

    it("preserves labels", () => {
      const content = "See [[page-a|Custom Label]]";
      const pagesBySlug = new Map([
        ["page-a", mockPage({ slug: "page-a", title: "Page A" })],
      ]);
      const resolved = resolveWikiLinks(content, pagesBySlug);
      expect(resolved[0].label).toBe("Custom Label");
    });

    it("includes page IDs for existing pages", () => {
      const content = "See [[page-a]]";
      const pagesBySlug = new Map([
        ["page-a", mockPage({ id: "page-abc", slug: "page-a" })],
      ]);
      const resolved = resolveWikiLinks(content, pagesBySlug);
      expect(resolved[0].pageId).toBe("page-abc");
    });
  });

  describe("buildPagesBySlug", () => {
    it("builds map from pages", () => {
      const pages = [
        mockPage({ slug: "page-a" }),
        mockPage({ slug: "page-b" }),
      ];
      const map = buildPagesBySlug(pages);
      expect(map.size).toBe(2);
      expect(map.has("page-a")).toBe(true);
      expect(map.has("page-b")).toBe(true);
    });

    it("returns empty map for empty array", () => {
      const map = buildPagesBySlug([]);
      expect(map.size).toBe(0);
    });

    it("uses last page for duplicate slugs", () => {
      const pages = [
        mockPage({ id: "1", slug: "page-a", title: "First" }),
        mockPage({ id: "2", slug: "page-a", title: "Second" }),
      ];
      const map = buildPagesBySlug(pages);
      expect(map.size).toBe(1);
      expect(map.get("page-a")?.title).toBe("Second");
    });
  });
});

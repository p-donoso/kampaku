import type { WikiPageRecord } from "../../persistence/wiki-store.js";

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export interface WikiLinkRef {
  slug: string;
  label?: string;
  title?: string;
  exists: boolean;
  pageId?: string;
}

export function extractWikiLinks(contentMd: string): Array<{ slug: string; label?: string }> {
  const links: Array<{ slug: string; label?: string }> = [];
  const seen = new Set<string>();
  for (const match of contentMd.matchAll(WIKI_LINK_RE)) {
    const slug = match[1]?.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    links.push({ slug, label: match[2]?.trim() || undefined });
  }
  return links;
}

export function resolveWikiLinks(
  contentMd: string,
  pagesBySlug: Map<string, WikiPageRecord>,
): WikiLinkRef[] {
  return extractWikiLinks(contentMd).map(({ slug, label }) => {
    const target = pagesBySlug.get(slug);
    return {
      slug,
      label,
      title: target?.title,
      exists: Boolean(target && target.status === "published"),
      pageId: target?.id,
    };
  });
}

export function buildPagesBySlug(pages: WikiPageRecord[]): Map<string, WikiPageRecord> {
  return new Map(pages.map((page) => [page.slug, page]));
}

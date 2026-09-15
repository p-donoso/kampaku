const SOURCE_DOMAINS = [
  "coe.int", "actfl.org", "govtilr.org", "state.gov", "jlpt.jp", "jpf.go.jp",
  "nextjs.org", "mui.com", "prisma.io", "typescriptlang.org", "w3.org",
  "developer.mozilla.org", "github.com", "openai.com", "anthropic.com", "groq.com",
];

const MAX_BYTES = 200_000;
const MAX_TEXT_CHARS = 24_000;

export function assertPublicSourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Public sources must use HTTPS without embedded credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (!SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error(`Source host is not allowlisted: ${host}`);
  }
  return url;
}

async function limitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value.slice(0, MAX_BYTES - size);
    chunks.push(chunk);
    size += chunk.byteLength;
    if (chunk.byteLength < next.value.byteLength) break;
  }
  await reader.cancel();
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchPublicSource(value: string): Promise<string> {
  let url = assertPublicSourceUrl(value);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "text/html, text/plain, application/json, application/xml" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Source redirect has no location.");
      url = assertPublicSourceUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/(text\/|application\/(json|xml|xhtml\+xml))/.test(type)) {
      throw new Error(`Source is not readable text: ${type || "unknown content type"}.`);
    }
    const raw = await limitedText(response);
    const text = type.includes("html")
      ? raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ")
        .replace(/\s+/g, " ").trim()
      : raw;
    return JSON.stringify({ url: url.href, text: text.slice(0, MAX_TEXT_CHARS), truncated: raw.length > MAX_TEXT_CHARS });
  }
  throw new Error("Source redirected too many times.");
}

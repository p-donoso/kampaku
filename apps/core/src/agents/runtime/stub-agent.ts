export interface ParsedSubAgentRequest {
  slug: string;
  name: string;
  responsibilities: string;
}

const CREATE_PATTERNS = [
  /create\s+(?:a\s+)?sub-?agent\s+(?:named\s+|called\s+)?["']?([a-z0-9-]+)["']?\s*(?:that\s+(.+))?/i,
];

export function parseSubAgentRequest(message: string): ParsedSubAgentRequest | undefined {
  const trimmed = message.trim();

  for (const pattern of CREATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (match[2] && match[1]) {
      const slug = match[1].toLowerCase();
      const responsibilities = match[2].trim().replace(/\.$/, "");
      return {
        slug,
        name: slugToName(slug),
        responsibilities,
      };
    }

    if (match[1] && !match[2]) {
      const slug = match[1].toLowerCase();
      return {
        slug,
        name: slugToName(slug),
        responsibilities: `Handle tasks related to ${slugToName(slug)}.`,
      };
    }
  }

  const fallback = trimmed.match(
    /sub-?agent\s+(?:named\s+|called\s+)?["']?([a-z0-9-]+)["']?\s*(?:that\s+(.+))?/i,
  );
  if (fallback?.[1]) {
    const slug = fallback[1].toLowerCase();
    return {
      slug,
      name: slugToName(slug),
      responsibilities: fallback[2]?.trim().replace(/\.$/, "") ?? `Responsibilities for ${slugToName(slug)}.`,
    };
  }

  return undefined;
}

export function buildStubSystemPrompt(
  name: string,
  responsibilities: string,
): string {
  return [
    `You are ${name}, a specialized Kampaku sub-agent.`,
    "",
    "Responsibilities:",
    responsibilities,
    "",
    "Operate within your defined role. Report to the emperor through Kampaku when needed.",
  ].join("\n");
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isListAgentsRequest(message: string): boolean {
  return /^(?:list|show)\s+(?:the\s+)?(?:sub-?)?agents?/i.test(message.trim());
}

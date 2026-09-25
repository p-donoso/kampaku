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

/**
 * A question about what exists: projects, teams, open work.
 *
 * Why the stub mode needs this at all. It used to answer an inventory question with a fixed sentence about
 * what Kampaku *can* do — "I can clarify intent, delegate work through responsible agents, and report
 * verified durable outcomes" — which is not an answer to the question and is the same class of defect the
 * whole program exists to remove: a fluent reply that names no entity. Suite 01's own first bullet is that
 * a stranger can ask what exists and be told the truth.
 *
 * The offline mode has no excuse for that, because it does not have to guess: the durable state is read
 * from the same stores the other surfaces read. So the reply is the block, verbatim, which is
 * [F-024](../../../../docs/eval/results/BOARD.md)'s recommended option (a) implemented where it is
 * deterministic — "make the block the reply, so the ordinary case does not require the model to compose
 * anything".
 */
export function isStateInventoryRequest(message: string): boolean {
  const text = message.trim();

  // Two conditions, and both are needed: it asks, and what it asks about is this factory's state.
  //
  // Built this way after two false negatives in a row — the first version required the verb beside the
  // interrogative and missed "what projects and teams are there", and it treated the noun **"open work"** as
  // the verb *open*. Enumerating sentence shapes is how a classifier rots; asking two questions and
  // requiring both is what survives the next phrasing.
  const asks =
    /\b(what|which|how many|are we|do we have|show me|list|tell me)\b/i.test(text) &&
    /\?|\b(what|which|show me|list|tell me|are we|do we have)\b/i.test(text);
  const aboutState =
    /\b(projects?|teams?|agents?|roster|work(?:\s+items?|\s+orders?)?|open work|blockers?|questions?|here|factory|instance|exist(?:s|ing)?|ready|state|status)\b/i.test(
      text,
    );
  // A command is not a question, even when it contains one. `open` needs the lookahead because "open work"
  // is a noun phrase.
  const mutates =
    /\b(create|open(?!\s+work)|add|delete|remove|start|execute|pause|assign|refuse|triage|delegate|staff)\b/i.test(
      text,
    );

  return asks && aboutState && !mutates;
}

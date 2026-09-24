import type { Store } from "../../persistence/store.js";

const SETTINGS_KEY = "global_system_prompt";

/**
 * The one prompt every agent inherits.
 *
 * It is prepended to the front office (`session.ts`), to every project lead and specialist session
 * (`sub-agent-session.ts`), and to the planner (`create-goal.ts`). That reach is why the deliverable
 * and its boundary are stated **here** rather than only in the front-office prompt: the front office
 * knew what the factory builds, and the line — the agents that actually plan and write — did not.
 *
 * A line agent that has never been told the deliverable can be handed an out-of-scope objective and
 * will plan it in good faith, which is how a refusal becomes a degraded artifact.
 */
export const DEFAULT_GLOBAL_SYSTEM_PROMPT = `You are in service to the Emperor. He is strong and understanding. You are part of a cause larger than what you may be able to see: trust the process and work faithfully toward its objective. Loyalty requires honesty—never invent progress, conceal mistakes, or claim success without evidence.

You serve one person, and this factory builds one kind of thing. The deliverable is software and the technical artifacts that ship with it: applications, services, libraries, SDKs, infrastructure as code, data and pipeline code, tooling, test assets, and the documentation that is verified against the code it describes. Creative writing, open-ended non-technical research, non-technical documents, and design as a standalone deliverable are outside its scope. If you are asked for one of them, say so plainly and name the boundary; do not produce a degraded substitute, and do not pass it on as though it were work you can accept.

The test is the evidence, not the topic: something is in scope when its acceptance evidence can be executed, inspected, or measured against a technical contract. Inside that scope the factory assumes nothing — read the project's language, toolchain, project type, and architecture from the repository rather than guessing them, and let the project's own conventions outrank any habit of yours.

Write all workspace artifacts in English: code comments, task titles, wiki pages, journal entries, error messages, UI copy, and structured question prompts. Conversational replies may follow the emperor's language, but persisted or machine-readable output must stay in English unless localization is explicitly requested.`;

export interface GlobalSystemPromptSettings {
  prompt: string;
}

export function getGlobalSystemPromptSettings(store: Store): GlobalSystemPromptSettings {
  return store.getBootstrapState<GlobalSystemPromptSettings>(SETTINGS_KEY) ?? {
    prompt: DEFAULT_GLOBAL_SYSTEM_PROMPT,
  };
}

export function saveGlobalSystemPromptSettings(
  store: Store,
  prompt: string,
): GlobalSystemPromptSettings {
  const normalized = prompt.trim();
  if (!normalized) throw new Error("Global system prompt cannot be empty.");
  if (normalized.length > 4_000) throw new Error("Global system prompt cannot exceed 4,000 characters.");
  const settings = { prompt: normalized };
  store.setBootstrapState(SETTINGS_KEY, settings);
  return settings;
}

export function prependGlobalSystemPrompt(store: Store, prompt: string): string {
  return `${getGlobalSystemPromptSettings(store).prompt}\n\n${prompt}`;
}

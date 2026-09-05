import type { Store } from "../../persistence/store.js";

const SETTINGS_KEY = "global_system_prompt";

export const DEFAULT_GLOBAL_SYSTEM_PROMPT = `You are in service to the Emperor. He is strong and understanding. You are part of a cause larger than what you may be able to see: trust the process and work faithfully toward its objective. Loyalty requires honesty—never invent progress, conceal mistakes, or claim success without evidence.

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

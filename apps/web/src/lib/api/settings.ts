import type {
  FilesystemSettings,
  ModelProviderSettings,
  RuntimeStatus,
} from "../types";
import { fetchJson, getBaseUrl } from "./client";

/**
 * Result payload from system data reset operations.
 */
export interface SystemResetResult {
  /** Mode applied: bootstrap default or all. */
  mode: "bootstrap" | "all";
  /** Agent slugs removed during reset. */
  deletedAgents: string[];
  /** Default agents created. */
  createdAgents: string[];
  /** Count of preserved learnings transferred. */
  inheritedLearnings: number;
}

/**
 * Checks Core API health endpoint.
 */
export function healthCheck(): Promise<boolean> {
  try {
    return fetch(`${getBaseUrl()}/api/v1/health`, { cache: "no-store" }).then((res) => res.ok).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Retrieves allowed folder whitelist for filesystem isolation.
 */
export function getFilesystemSettings(): Promise<FilesystemSettings> {
  return fetchJson("/api/v1/settings/filesystem");
}

/**
 * Retrieves the global system prompt configured for runtime agents.
 */
export function getGlobalSystemPromptSettings(): Promise<{ prompt: string }> {
  return fetchJson("/api/v1/settings/global-system-prompt");
}

/**
 * Updates the global system prompt across all runtime agents.
 */
export function updateGlobalSystemPrompt(prompt: string): Promise<{ prompt: string }> {
  return fetchJson("/api/v1/settings/global-system-prompt", {
    method: "PUT",
    body: JSON.stringify({ prompt }),
  });
}

/**
 * Retrieves active model provider settings and credentials status.
 */
export function getModelProviderSettings(): Promise<ModelProviderSettings> {
  return fetchJson("/api/v1/settings/model-provider");
}

/**
 * Updates LLM model provider connection settings.
 */
export function updateModelProviderSettings(
  input: ModelProviderSettings & { apiKey?: string; clearApiKey?: boolean },
): Promise<ModelProviderSettings> {
  return fetchJson("/api/v1/settings/model-provider", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Resets platform data to bootstrap baseline while optionally retaining specialist learnings.
 */
export function resetBootstrap(keepLearnings: boolean): Promise<SystemResetResult> {
  return fetchJson("/api/v1/settings/reset-bootstrap", {
    method: "POST",
    body: JSON.stringify({ keepLearnings }),
  });
}

/**
 * Performs complete database reset to initial fresh install state.
 */
export function resetAllData(): Promise<SystemResetResult> {
  return fetchJson("/api/v1/settings/reset-all", { method: "POST" });
}

/**
 * Fetches platform daemon runtime status.
 */
export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return fetchJson("/api/v1/runtime/status");
}

import type { AppConfig } from "../../config.js";
import type { Store } from "../../persistence/store.js";

const SETTINGS_KEY = "model_provider_settings";

export interface ModelProviderSettings {
  provider: string;
  protocol: "openai-v1";
  baseUrl: string;
  apiKey?: string;
  model: string;
  /**
   * The endpoint's effective context window, when the operator has stated it.
   *
   * Deliberately **not** part of the stored settings. A context window is a property of the running
   * endpoint rather than of a saved preference, and stored settings already silently outrank the
   * environment once ([F-026](../../../../../docs/eval/results/BOARD.md)), which is the defect this
   * avoids repeating: an operator who changes the endpoint's context and sees nothing change has no
   * signal. It is read from the environment on every turn instead.
   */
  contextTokens?: number;
  /** Tokens held back for the reply when checking whether a turn fits. */
  replyReserveTokens?: number;
}

export interface PublicModelProviderSettings extends Omit<ModelProviderSettings, "apiKey"> {
  apiKeyConfigured: boolean;
}

export function resolveModelProviderSettings(store: Store, config: AppConfig): ModelProviderSettings {
  const stored = store.getBootstrapState<ModelProviderSettings>(SETTINGS_KEY);
  const context = {
    contextTokens: config.modelContextTokens,
    replyReserveTokens: config.modelReplyReserveTokens,
  };
  if (stored) {
    // The stored provider/model outrank the environment (F-026, still open). The context window does
    // not, on purpose: it describes the endpoint that is actually running, not a saved preference.
    return { ...stored, ...context };
  }
  return {
    provider: "OpenAI-compatible",
    protocol: "openai-v1",
    baseUrl: config.modelBaseUrl ?? config.freellmapiBaseUrl ?? "http://localhost:3001/v1",
    apiKey: config.modelApiKey ?? config.freellmapiApiKey,
    model: config.agentModel,
    ...context,
  };
}

export function toPublicModelProviderSettings(settings: ModelProviderSettings): PublicModelProviderSettings {
  const { apiKey, ...publicSettings } = settings;
  return { ...publicSettings, apiKeyConfigured: Boolean(apiKey) };
}

export function saveModelProviderSettings(
  store: Store,
  config: AppConfig,
  input: Partial<ModelProviderSettings> & { clearApiKey?: boolean },
): PublicModelProviderSettings {
  const current = resolveModelProviderSettings(store, config);
  const provider = input.provider?.trim() ?? current.provider;
  const baseUrl = input.baseUrl?.trim().replace(/\/$/, "") ?? current.baseUrl;
  const model = input.model?.trim() ?? current.model;
  if (!provider) throw new Error("Provider name is required");
  if (!model) throw new Error("Model is required");
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Base URL must use http or https");
  if (!url.pathname.replace(/\/$/, "").endsWith("/v1")) throw new Error("OpenAI v1 base URL must end in /v1");

  const apiKey = input.clearApiKey ? undefined : input.apiKey?.trim() || current.apiKey;
  const settings: ModelProviderSettings = {
    provider,
    protocol: "openai-v1",
    baseUrl,
    apiKey,
    model,
  };
  store.setBootstrapState(SETTINGS_KEY, settings);
  return toPublicModelProviderSettings(settings);
}

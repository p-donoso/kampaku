import type { AppConfig } from "../../config.js";
import type { Store } from "../../persistence/store.js";

const SETTINGS_KEY = "model_provider_settings";

export interface ModelProviderSettings {
  provider: string;
  protocol: "openai-v1";
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface PublicModelProviderSettings extends Omit<ModelProviderSettings, "apiKey"> {
  apiKeyConfigured: boolean;
}

export function resolveModelProviderSettings(store: Store, config: AppConfig): ModelProviderSettings {
  return store.getBootstrapState<ModelProviderSettings>(SETTINGS_KEY) ?? {
    provider: "Free LLM API",
    protocol: "openai-v1",
    baseUrl: config.freellmapiBaseUrl,
    apiKey: config.freellmapiApiKey,
    model: config.agentModel,
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

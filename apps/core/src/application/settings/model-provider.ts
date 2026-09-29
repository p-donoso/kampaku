import type { AppConfig } from "../../config.js";
import type { ModelBrokerOptions, ReasoningEffort } from "../../model-broker/types.js";
import type { Store } from "../../persistence/store.js";

const SETTINGS_KEY = "model_provider_settings";

export interface ModelProviderSettings {
  provider: string;
  protocol: "openai-v1";
  /**
   * No default host. The value comes from the stored setting or from `KAMPAKU_MODEL_BASE_URL`, and when
   * neither exists it stays absent so the broker can name the missing setting instead of dialling a
   * port nobody configured.
   */
  baseUrl?: string;
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
    baseUrl: config.modelBaseUrl,
    apiKey: config.modelApiKey,
    model: config.agentModel,
    ...context,
  };
}

/**
 * What a call is for, which is the only thing that decides how much reasoning it may buy.
 *
 * Two roles, not four models: the split is deliberately by **purpose** rather than by station, so staffing a
 * new seat cannot quietly introduce a third budget nobody chose. See `docs/concepts/token-economy.md`.
 */
export type ModelRole = "planning" | "execution";

/**
 * The reasoning budget a role gets.
 *
 * Planning decides what will be done, and a plan that is wrong is paid for again by every attempt under it,
 * so it is the one call in this product allowed to think hard. Execution reads, calls, and writes what the
 * plan already said, so it asks for the cheap budget. The values are the endpoint's own vocabulary and come
 * from `KAMPAKU_PLANNER_REASONING_EFFORT` and `KAMPAKU_AGENT_REASONING_EFFORT`; either can be `off`.
 */
export function reasoningEffortFor(role: ModelRole, config: AppConfig): ReasoningEffort | undefined {
  return role === "planning" ? config.plannerReasoningEffort : config.agentReasoningEffort;
}

/**
 * The broker options for a role: its model, its endpoint, and its reasoning budget.
 *
 * Every broker in the product is built through here, so "which effort does this call get" has one answer that
 * a test can read, instead of an argument each call site passes and periodically forgets. Forgetting it is
 * invisible — the call still works, it just costs more — which is exactly why it is not left to discipline.
 *
 * The role also carries the model choice that used to be spelled out at the two planning sites:
 * `KAMPAKU_PLANNER_MODEL` plans, the configured agent model executes.
 */
export function brokerOptionsFor(
  role: ModelRole,
  config: AppConfig,
  provider: ModelProviderSettings,
): ModelBrokerOptions {
  return {
    ...provider,
    model: role === "planning" ? config.plannerModel : provider.model,
    reasoningEffort: reasoningEffortFor(role, config),
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
  if (!baseUrl) {
    throw new Error(
      "An endpoint base URL is required. Set KAMPAKU_MODEL_BASE_URL, or provide baseUrl here.",
    );
  }
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

import type { AppConfig } from "../../config.js";
import type { ModelBrokerOptions, ReasoningEffort } from "../../model-broker/types.js";
import type { EndpointCapabilityRecord } from "../../model-broker/endpoint-capability.js";
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

/**
 * Where each field of the effective settings came from.
 *
 * This is BOARD F-026's whole point: the precedence was "stored settings win, silently", so an operator who
 * changed `KAMPAKU_AGENT_MODEL` and saw nothing change had no way to tell a broken endpoint from a setting
 * that was never read. Measured 2026-09-24: environment said `qwen2.5:7b-instruct`, the settings route said
 * `qwen2.5:14b`, and the turn used 14b.
 */
export type ModelProviderFieldSource = "environment" | "stored" | "default";

export interface ModelProviderPrecedence {
  baseUrl: ModelProviderFieldSource;
  model: ModelProviderFieldSource;
  apiKey: ModelProviderFieldSource;
  /**
   * The one sentence an operator needs when they have changed the environment and nothing moved: which
   * surface won, and what to do about it. Absent when the answer is uninteresting.
   */
  note?: string;
}

/**
 * The settings an operator can read and write, with the precedence stated in the same payload.
 *
 * A second field name (`source`) rather than a second route: the surface that shows the values is the one that
 * has to say where they came from, or the operator has to guess between two places.
 */
export interface PublicModelProviderSettings extends Omit<ModelProviderSettings, "apiKey"> {
  apiKeyConfigured: boolean;
  source: Omit<ModelProviderPrecedence, "note">;
  note?: string;
  /**
   * What this process last measured about the endpoint's capability, or absent when it has not been probed
   * yet. Set by the turn that probed it — see `model-broker/endpoint-capability.ts` and BOARD F-008.
   */
  capability?: EndpointCapabilityRecord;
}

/**
 * The environment outranks stored settings, and that reversal is the fix.
 *
 * Two documented surfaces, one precedence: a value the operator states in the environment — which is how a run
 * is configured (`docs/eval/00-protocol.md`) and how the contract documents the endpoint (`KAMPAKU_MODEL_*`) —
 * is the value in force, and a value saved in the UI fills whatever the environment does not state. Before this,
 * the stored value silently won, so a run that exported `KAMPAKU_AGENT_MODEL` measured whatever had been saved
 * weeks earlier (BOARD F-026).
 *
 * Explicit beats implicit is the whole rule, so `KAMPAKU_AGENT_MODEL=auto` (the shipped default) counts as
 * **not stated**: a default is not an instruction.
 */
export function resolveModelProviderSettings(store: Store, config: AppConfig): ModelProviderSettings {
  return resolveModelProviderSettingsWithPrecedence(store, config).settings;
}

export function resolveModelProviderSettingsWithPrecedence(
  store: Store,
  config: AppConfig,
): { settings: ModelProviderSettings; precedence: ModelProviderPrecedence } {
  const stored = store.getBootstrapState<ModelProviderSettings>(SETTINGS_KEY);
  const context = {
    contextTokens: config.modelContextTokens,
    replyReserveTokens: config.modelReplyReserveTokens,
  };
  const envBaseUrl = config.modelBaseUrlPinned;
  const envApiKey = config.modelApiKeyPinned;
  const envModel = config.agentModelPinned;

  const baseUrl = envBaseUrl ?? stored?.baseUrl ?? config.modelBaseUrl;
  const apiKey = envApiKey ?? stored?.apiKey ?? config.modelApiKey;
  const model = envModel ?? stored?.model ?? config.agentModel;
  const source = {
    baseUrl: envBaseUrl ? "environment" : stored?.baseUrl ? "stored" : "default",
    apiKey: envApiKey ? "environment" : stored?.apiKey ? "stored" : "default",
    model: envModel ? "environment" : stored?.model ? "stored" : "default",
  } as const satisfies Omit<ModelProviderPrecedence, "note">;

  const settings: ModelProviderSettings = {
    provider: stored?.provider ?? "OpenAI-compatible",
    protocol: "openai-v1",
    baseUrl,
    apiKey,
    model,
    ...context,
  };
  return { settings, precedence: { ...source } };
}

/**
 * Which settings the environment is holding, and therefore which saved values cannot take effect.
 *
 * Returned by the write path rather than only by the read path, because the operator who needs this sentence is
 * the one who has just saved something. A save that appears to work and changes nothing is the defect.
 */
export function environmentPins(config: AppConfig): Array<"baseUrl" | "apiKey" | "model"> {
  const pins: Array<"baseUrl" | "apiKey" | "model"> = [];
  if (config.modelBaseUrlPinned) pins.push("baseUrl");
  if (config.modelApiKeyPinned) pins.push("apiKey");
  if (config.agentModelPinned) pins.push("model");
  return pins;
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
    // The per-call budget, from the two settings `AppConfig` documents and defaults. They are attached here,
    // with the effort, because "which broker forgot its timeout" has to have one answer — see
    // `call-budget.ts` for the measurement that found them read nowhere (BOARD F-061).
    initialTimeoutMs: config.modelInitialTimeoutMs,
    initialRetries: config.modelInitialRetries,
  };
}

export function toPublicModelProviderSettings(
  settings: ModelProviderSettings,
  precedence?: ModelProviderPrecedence,
): PublicModelProviderSettings {
  const { apiKey, ...publicSettings } = settings;
  const source = precedence ?? { baseUrl: "default", apiKey: "default", model: "default" };
  const { note, ...fields } = source;
  return {
    ...publicSettings,
    apiKeyConfigured: Boolean(apiKey),
    source: fields,
    ...(note ? { note } : {}),
  };
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
  const { precedence } = resolveModelProviderSettingsWithPrecedence(store, config);
  const pinned = environmentPins(config);
  return toPublicModelProviderSettings(settings, {
    ...precedence,
    ...(pinned.length > 0
      ? {
          note:
            "Saved. The environment also states " +
            `${pinned.join(", ")}: a value the environment states is the one in force, so the saved value ` +
            "takes effect only after those settings are removed from the environment and Core is restarted. " +
            "This is the documented precedence — explicit environment beats a saved preference.",
        }
      : {}),
  });
}

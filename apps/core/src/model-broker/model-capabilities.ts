export interface ModelCapabilities { structuredOutput: boolean; toolCalls: boolean; streaming: boolean; maxInputTokens?: number; }
export interface ModelProfile { protocol: "openai-v1"; model: string; capabilities: ModelCapabilities }

export function negotiateModelCapabilities(required: Partial<ModelCapabilities>, available: ModelCapabilities): { ok: boolean; missing: string[] } {
  const missing = Object.entries(required).filter(([key, value]) => value === true && available[key as keyof ModelCapabilities] !== true).map(([key]) => key);
  return { ok: missing.length === 0, missing };
}

export function providerNeutralProfile(model: string, capabilities: ModelCapabilities): ModelProfile {
  return { protocol: "openai-v1", model, capabilities };
}

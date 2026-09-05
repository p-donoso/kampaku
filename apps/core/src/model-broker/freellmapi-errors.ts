export function describeFreellmapiInferenceError(detail: string): string {
  const lower = detail.toLowerCase();

  if (
    lower.includes("all models exhausted") ||
    lower.includes("no usable key configured") ||
    lower.includes("model lacks tool-calling")
  ) {
    return (
      "FreeLLMApi has no working upstream provider keys for tool-calling models. " +
      "Open http://localhost:3001, add provider API keys (OpenAI, Anthropic, Ollama, etc.), " +
      "then set KAMPAKU_AGENT_MODEL to a model that supports tools."
    );
  }

  if (
    lower.includes("provider_authentication_failed") ||
    lower.includes("upstream api key") ||
    lower.includes("provider key")
  ) {
    return (
      "FreeLLMApi upstream provider keys are invalid or expired. " +
      "Update them in http://localhost:3001 (Settings → API Keys)."
    );
  }

  if (lower.includes("401") && lower.includes("api key")) {
    return (
      "Invalid FREELLMAPI_API_KEY. Copy the unified key from http://localhost:3001 into .env " +
      "and restart kampaku dev."
    );
  }

  return detail;
}

export function formatKampakuProviderError(detail: string): string {
  return `Failed to contact the AI provider: ${describeFreellmapiInferenceError(detail)}`;
}

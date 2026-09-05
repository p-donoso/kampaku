export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface ChatCompletionResult {
  content: string;
  routedVia?: string;
  model?: string;
}

export interface ChatCompletionWithToolsResult {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  model?: string;
}

export interface ModelBrokerOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

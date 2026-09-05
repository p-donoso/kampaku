export type ChatProgressEvent =
  | { phase: "thinking" }
  | { phase: "tool"; tool: string; label: string }
  | { phase: "composing" };

export type ChatProgressCallback = (event: ChatProgressEvent) => void;

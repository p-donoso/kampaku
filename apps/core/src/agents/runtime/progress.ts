export type ChatProgressEvent =
  | { phase: "thinking" }
  | { phase: "tool"; tool: string; label: string }
  /**
   * Stale tool results were cleared before a model call.
   *
   * Reported because a context decision that is invisible cannot be tuned: the operator needs to see the
   * turn being kept inside the window, and how much that bought.
   */
  | { phase: "pruning"; cleared: number; tokensSaved: number }
  | { phase: "composing" };

export type ChatProgressCallback = (event: ChatProgressEvent) => void;

"use client";

import CircularProgress from "@mui/material/CircularProgress";

interface ThinkingIndicatorProps {
  phase: "thinking" | "composing";
  toolSteps: Array<{ tool: string; label: string }>;
}

export function ThinkingIndicator({ phase, toolSteps }: ThinkingIndicatorProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-elevated/80 px-4 py-3 text-sm text-muted">
        <div className="flex items-center gap-2">
          <CircularProgress size={14} color="inherit" />
          <span>{phase === "composing" ? "Composing reply…" : "Thinking…"}</span>
        </div>
        {toolSteps.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-border/50 pt-2 text-xs">
            {toolSteps.map((step, index) => (
              <li key={`${step.tool}-${step.label}-${index}`} className="text-secondary">
                {step.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

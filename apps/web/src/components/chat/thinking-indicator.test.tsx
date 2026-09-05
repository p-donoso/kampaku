import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { MaterialProvider } from "@/components/material-provider";
import { ThemeProvider } from "@/components/theme-provider";

describe("ThinkingIndicator", () => {
  it("shows composing state and tool labels", () => {
    render(
      <ThemeProvider>
        <MaterialProvider>
          <ThinkingIndicator
            phase="composing"
            toolSteps={[{ tool: "list_agents", label: "Listing agents" }]}
          />
        </MaterialProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText("Composing reply…")).toBeInTheDocument();
    expect(screen.getByText("Listing agents")).toBeInTheDocument();
  });
});

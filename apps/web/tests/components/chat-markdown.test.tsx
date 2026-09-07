import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { MaterialProvider } from "@/components/material-provider";
import { ThemeProvider } from "@/components/theme-provider";

describe("ChatMarkdown", () => {
  it("renders headings and lists", () => {
    render(
      <ThemeProvider>
        <MaterialProvider>
          <ChatMarkdown content={"## Status\n\n- one\n- two"} />
        </MaterialProvider>
      </ThemeProvider>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Status" })).toBeInTheDocument();
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("renders links with safe attributes", () => {
    render(
      <ThemeProvider>
        <MaterialProvider>
          <ChatMarkdown content="[Docs](https://example.com)" />
        </MaterialProvider>
      </ThemeProvider>,
    );
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PALETTE_ID, THEME_STORAGE_KEY } from "@/design/tokens";

/**
 * Verifies client-side interactivity after render — the behaviour that fails when
 * Next.js blocks /_next/* chunks on LAN dev hosts without allowedDevOrigins.
 */
describe("ThemeToggle client interactivity", () => {
  it("attaches a working click handler that updates DOM and storage", async () => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-palette", PALETTE_ID);

    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByTestId("theme-toggle");
    expect(button).toBeEnabled();

    await user.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(button).toHaveAccessibleName("Switch to dark theme");
  });

  it("react fiber attaches onClick in jsdom (hydration proxy check)", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByTestId("theme-toggle");
    const reactKey = Object.keys(button).find((key) => key.startsWith("__reactProps"));
    expect(reactKey).toBeDefined();
    expect((button as unknown as Record<string, { onClick?: unknown }>)[reactKey!]?.onClick).toBeTypeOf(
      "function",
    );
  });
});

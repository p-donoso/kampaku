import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  applyDocumentTheme,
  readThemeFromDocument,
  resolveInitialTheme,
  ThemeProvider,
} from "@/components/theme-provider";
import { useTheme } from "@/hooks/use-theme";
import { PALETTE_ID, THEME_STORAGE_KEY } from "@/design/tokens";

function SetLightButton() {
  const { setTheme } = useTheme();
  return (
    <button type="button" onClick={() => setTheme("light")}>
      Force light
    </button>
  );
}

describe("applyDocumentTheme", () => {
  /**
   * Verifies that applying a theme writes palette + mode attributes on the document root
   * so CSS token blocks can switch between dark and light Imperial Cinnabar values.
   */
  it("sets data-theme, data-palette, and colorScheme on html", () => {
    applyDocumentTheme("light");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-palette")).toBe(PALETTE_ID);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

describe("resolveInitialTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  /**
   * User preference in localStorage must win over the SSR default on html.
   */
  it("prefers localStorage over document data-theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    expect(resolveInitialTheme()).toBe("light");
  });

  /**
   * Falls back to document theme when nothing is stored yet (anti-FOUC script).
   */
  it("uses document theme when localStorage is empty", () => {
    document.documentElement.setAttribute("data-theme", "light");

    expect(resolveInitialTheme()).toBe("light");
    expect(readThemeFromDocument()).toBe("light");
  });
});

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-palette", PALETTE_ID);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  /**
   * Clicking the toggle should flip React state, persist the choice, and update html
   * attributes so the UI actually switches theme on the first click.
   */
  it("toggles theme on click and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  /**
   * When html is already light (anti-FOUC) but labels still show dark, the first click
   * must move to dark — not stay on light silently.
   */
  it("toggles from document light theme on first click", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  /**
   * Explicit setTheme path used by Settings should also sync DOM + storage.
   */
  it("setTheme via provider updates document and storage", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <SetLightButton />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Force light" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("ThemeProvider system preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  /**
   * Without a stored preference, provider should follow prefers-color-scheme on mount.
   */
  it("uses system theme when nothing is stored", () => {
    document.documentElement.removeAttribute("data-theme");

    expect(resolveInitialTheme()).toBe("dark");
  });
});

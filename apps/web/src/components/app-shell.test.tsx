import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MaterialProvider } from "@/components/material-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { PALETTE_ID, THEME_STORAGE_KEY } from "@/design/tokens";
import { SIDEBAR_STORAGE_KEY } from "@/lib/sidebar-preference";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

vi.mock("@/lib/api", () => ({
  healthCheck: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/components/panel-provider", () => ({
  PanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/imperial-seal-logo", () => ({
  ImperialSealLogo: () => <div data-testid="brand-logo">Logo</div>,
  ImperialSealMark: () => <div data-testid="brand-mark">Mark</div>,
}));

function ShellHarness({ children = <div>Page</div> }: { children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MaterialProvider>
        <AppShell>{children}</AppShell>
      </MaterialProvider>
    </ThemeProvider>
  );
}

describe("AppShell integration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.setAttribute("data-palette", PALETTE_ID);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "dark");
  });

  /**
   * Simulates a user clicking the sidebar collapse control and verifies the aside
   * width class and persisted preference update together.
   */
  it("collapses and expands the sidebar on button clicks", async () => {
    const user = userEvent.setup();
    render(<ShellHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("app-sidebar").className).toContain("w-56");
    });

    const sidebar = screen.getByTestId("app-sidebar");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(sidebar.className).toContain("w-16");
    expect(sidebar.className).not.toContain("w-56");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("true");

    await user.click(screen.getByTestId("sidebar-collapse-toggle"));
    expect(sidebar.className).toContain("w-56");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("false");
  });

  /**
   * Simulates theme toggle clicks inside the shell and verifies DOM + storage sync.
   */
  it("toggles light/dark theme from the sidebar control", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const user = userEvent.setup();
    render(<ShellHarness />);

    const sidebar = screen.getByTestId("app-sidebar");
    const themeToggle = within(sidebar).getByTestId("theme-toggle");

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(themeToggle).toHaveAccessibleName("Switch to dark theme");

    await user.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  /**
   * Restores a stored light theme on mount so the first click switches to dark.
   */
  it("honours stored light theme and toggles to dark on first click", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.documentElement.setAttribute("data-theme", "light");

    const user = userEvent.setup();
    render(<ShellHarness />);

    const themeToggle = within(screen.getByTestId("app-sidebar")).getByTestId("theme-toggle");
    await waitFor(() => {
      expect(themeToggle).toHaveAccessibleName("Switch to dark theme");
    });

    await user.click(themeToggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  /**
   * Verifies collapse preference survives a remount (simulates navigation remount).
   */
  it("restores collapsed sidebar from localStorage after remount", async () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");

    const { unmount } = render(<ShellHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("app-sidebar").className).toContain("w-16");
    });

    unmount();
    render(<ShellHarness />);
    await waitFor(() => {
      expect(screen.getByTestId("app-sidebar").className).toContain("w-16");
    });
  });
});

import { describe, expect, it } from "vitest";
import { readInitialSidebarCollapsed, SIDEBAR_STORAGE_KEY } from "@/lib/sidebar-preference";

describe("readInitialSidebarCollapsed", () => {
  /**
   * Explicit false in storage must be honoured on desktop widths that otherwise
   * default to collapsed tablet behaviour.
   */
  it("returns false when user explicitly expanded the sidebar", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });

    expect(readInitialSidebarCollapsed()).toBe(false);
  });

  /**
   * Tablet range without stored preference defaults to icon sidebar.
   */
  it("defaults to collapsed on tablet widths without stored preference", () => {
    localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });

    expect(readInitialSidebarCollapsed()).toBe(true);
  });
});

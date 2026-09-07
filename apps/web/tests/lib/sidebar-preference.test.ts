import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readInitialSidebarCollapsed, persistSidebarCollapsed, SIDEBAR_STORAGE_KEY } from "@/lib/sidebar-preference";

describe("sidebar-preference", () => {
  let originalWindow: any;
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    originalWindow = global.window;
    mockLocalStorage = {};

    global.window = {
      localStorage: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
      },
      innerWidth: 1024,
    } as any;
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  describe("readInitialSidebarCollapsed", () => {
    it("returns false when window is undefined", () => {
      global.window = undefined as any;
      expect(readInitialSidebarCollapsed()).toBe(false);
    });

    it("returns true when stored value is true", () => {
      mockLocalStorage[SIDEBAR_STORAGE_KEY] = "true";
      expect(readInitialSidebarCollapsed()).toBe(true);
    });

    it("returns false when stored value is false", () => {
      mockLocalStorage[SIDEBAR_STORAGE_KEY] = "false";
      expect(readInitialSidebarCollapsed()).toBe(false);
    });

    it("returns true for tablet width (768-1024) when no stored value", () => {
      global.window.innerWidth = 900;
      expect(readInitialSidebarCollapsed()).toBe(true);
    });

    it("returns false for desktop width (>=1024) when no stored value", () => {
      global.window.innerWidth = 1280;
      expect(readInitialSidebarCollapsed()).toBe(false);
    });

    it("returns false for mobile width (<768) when no stored value", () => {
      global.window.innerWidth = 500;
      expect(readInitialSidebarCollapsed()).toBe(false);
    });
  });

  describe("persistSidebarCollapsed", () => {
    it("persists true to localStorage", () => {
      persistSidebarCollapsed(true);
      expect(mockLocalStorage[SIDEBAR_STORAGE_KEY]).toBe("true");
    });

    it("persists false to localStorage", () => {
      persistSidebarCollapsed(false);
      expect(mockLocalStorage[SIDEBAR_STORAGE_KEY]).toBe("false");
    });
  });
});

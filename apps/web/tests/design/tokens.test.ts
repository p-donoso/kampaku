import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readCssVar, CSS_VARS, PALETTE_ID, THEME_STORAGE_KEY } from "@/design/tokens";

describe("tokens", () => {
  describe("constants", () => {
    it("exports PALETTE_ID", () => {
      expect(PALETTE_ID).toBe("imperial-cinnabar");
    });

    it("exports THEME_STORAGE_KEY", () => {
      expect(THEME_STORAGE_KEY).toBe("kampaku-theme");
    });

    it("exports CSS_VARS object with all tokens", () => {
      expect(CSS_VARS.bgBase).toBe("--bg-base");
      expect(CSS_VARS.bgSurface).toBe("--bg-surface");
      expect(CSS_VARS.bgElevated).toBe("--bg-elevated");
      expect(CSS_VARS.textPrimary).toBe("--text-primary");
      expect(CSS_VARS.textSecondary).toBe("--text-secondary");
      expect(CSS_VARS.textMuted).toBe("--text-muted");
      expect(CSS_VARS.borderDefault).toBe("--border-default");
      expect(CSS_VARS.brand).toBe("--brand");
      expect(CSS_VARS.brandSubtle).toBe("--brand-subtle");
      expect(CSS_VARS.brandGold).toBe("--brand-gold");
      expect(CSS_VARS.brandDeep).toBe("--brand-deep");
      expect(CSS_VARS.success).toBe("--success");
      expect(CSS_VARS.warning).toBe("--warning");
      expect(CSS_VARS.error).toBe("--error");
      expect(CSS_VARS.info).toBe("--info");
      expect(CSS_VARS.agent).toBe("--agent");
    });
  });

  describe("readCssVar", () => {
    beforeEach(() => {
      vi.stubGlobal("document", {
        documentElement: {
          style: {},
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns fallback when document is undefined", () => {
      vi.stubGlobal("document", undefined);
      const result = readCssVar("--test-var", "fallback");
      expect(result).toBe("fallback");
    });

    it("returns fallback when property value is empty", () => {
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: () => "",
      }));

      const result = readCssVar("--test-var", "fallback");
      expect(result).toBe("fallback");
    });

    it("returns trimmed property value when found", () => {
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: () => "  #ff0000  ",
      }));

      const result = readCssVar("--test-var");
      expect(result).toBe("#ff0000");
    });

    it("returns empty string as default fallback", () => {
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: () => "",
      }));

      const result = readCssVar("--test-var");
      expect(result).toBe("");
    });

    it("handles complex CSS values", () => {
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: () => "rgba(255, 0, 0, 0.5)",
      }));

      const result = readCssVar("--test-var");
      expect(result).toBe("rgba(255, 0, 0, 0.5)");
    });
  });
});

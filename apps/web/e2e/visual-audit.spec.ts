import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { gotoWithTheme, type ThemeMode } from "./helpers/theme";

const OUT_DIR = path.resolve(".audit-screenshots");

const ROUTES = [
  { name: "dashboard", path: "/" },
  { name: "projects", path: "/projects" },
  { name: "agents", path: "/agents" },
  { name: "agents-skills", path: "/agents/skills" },
  { name: "chat", path: "/chat" },
  { name: "journal", path: "/journal" },
  { name: "settings", path: "/settings" },
] as const;

const THEMES: ThemeMode[] = ["light", "dark"];

test.describe("visual audit screenshots", () => {
  test.beforeAll(async () => {
    await mkdir(OUT_DIR, { recursive: true });
  });

  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`${route.name} (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoWithTheme(page, route.path, theme);

        const file = path.join(OUT_DIR, `${route.name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });

        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByText("Kampaku").first()).toBeVisible();
      });
    }
  }
});

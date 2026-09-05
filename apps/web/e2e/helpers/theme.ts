import { type Page } from "@playwright/test";

export type ThemeMode = "light" | "dark";

/**
 * Applies theme after navigation so localStorage is available on a real origin.
 */
export async function applyTheme(page: Page, theme: ThemeMode): Promise<void> {
  await page.evaluate((mode) => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("kampaku-theme", mode);
  }, theme);
}

/**
 * Navigates to a path and forces the given theme for visual assertions.
 */
export async function gotoWithTheme(
  page: Page,
  path: string,
  theme: ThemeMode,
): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
  await applyTheme(page, theme);
  await page.waitForTimeout(400);
}

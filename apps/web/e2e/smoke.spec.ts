import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

const ROUTES = [
  { name: "Dashboard", path: "/" },
  { name: "Projects", path: "/projects" },
  { name: "Agents", path: "/agents" },
  { name: "Skills", path: "/agents/skills" },
  { name: "Chat", path: "/chat" },
  { name: "Journal", path: "/projects/journal" },
  { name: "Wiki", path: "/projects/wiki" },
  { name: "Settings", path: "/settings" },
] as const;

test.describe("shell smoke", () => {
  for (const route of ROUTES) {
    test(`${route.name} renders brand shell`, async ({ page }) => {
      await gotoWithTheme(page, route.path, "light");

      await expect(page.getByTestId("app-sidebar")).toBeVisible();
      await expect(page.getByRole("img", { name: "Kampaku" }).first()).toBeVisible();
      await expect(page.getByTestId("theme-toggle").first()).toBeVisible();
      await expect(page.getByTestId("sidebar-collapse-toggle")).toBeVisible();
    });
  }

  test("theme toggle switches data-theme", async ({ page }) => {
    await gotoWithTheme(page, "/", "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("app-sidebar").getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("app-sidebar").getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

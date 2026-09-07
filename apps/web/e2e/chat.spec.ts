import { expect, test } from "./fixtures";
import { gotoWithTheme } from "./helpers/theme";

test.describe.configure({ mode: "serial" });

test.describe("chat flow", () => {
  test("sends a message and shows assistant reply with markdown", async ({ page }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill("list agents");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Registered agents")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".chat-markdown", { hasText: "Registered agents" })).toBeVisible();
  });

  test("updates URL after first reply in a new chat", async ({ page }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill("list agents");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
  });
});

import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Locks docs/eval/01-fresh-start.md gates U3 and soft P3 against a real Core+Web stack.
 */
test.describe("eval suite 01 fresh start surfaces", () => {
  test("dashboard shows default project inventory from Core", async ({ page }) => {
    await gotoWithTheme(page, "/", "light");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Online").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Kampaku/i }).first()).toBeVisible();
    await expect(page.locator("span.font-mono", { hasText: /^kampaku$/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "kampaku-manager" })).toBeVisible();
  });

  test("agents page shows standing team under kampaku-manager", async ({ page }) => {
    await gotoWithTheme(page, "/agents", "light");

    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.getByText("kampaku-manager").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("kampaku-fullstack").first()).toBeVisible();
    await expect(page.getByText("kampaku-qa").first()).toBeVisible();
  });

  test("inspect then decide prompts: inventory chat and pending question on dashboard", async ({ page }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Are we ready? What exists here — projects, team, open work? Do not change anything.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Current State Overview")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/slug:\s*`?kampaku`?/i).first()).toBeVisible();
    await expect(page.getByText("No changes have been made.")).toBeVisible();

    await page.getByPlaceholder(/tell kampaku/i).fill(
      "If something is missing for a first run, tell me what I must decide. Do not create it yet.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.locator("#question-intent-next-focus").first()).toBeVisible({ timeout: 30_000 });

    await gotoWithTheme(page, "/", "light");
    await expect(page.getByRole("link", { name: /Pending questions/i })).toBeVisible();
    await page.getByRole("link", { name: /Pending questions/i }).click();
    await expect(page.locator("#pending-questions")).toBeVisible();
    const pendingCard = page
      .locator("#pending-questions article")
      .filter({ has: page.locator("#question-intent-next-focus") })
      .first();
    await expect(pendingCard).toBeVisible({ timeout: 15_000 });

    await pendingCard.getByLabel("Defer — do not create work yet").check();
    await pendingCard.getByRole("button", { name: /^Answer/i }).click();
    await expect(pendingCard).toHaveCount(0, { timeout: 15_000 });
  });
});

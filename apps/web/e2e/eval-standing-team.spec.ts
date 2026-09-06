import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Locks docs/eval/03-standing-team.md hierarchy visibility after staffing.
 */
test.describe("eval suite 03 standing team", () => {
  test("chat staffs eval-team-demo; agents and projects UI show lead hierarchy", async ({ page }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "I need a standing team for project work named eval-team-demo: one accountable lead and specialists for frontend, backend, and quality. Show me the hierarchy when done. Do not start coding yet.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Standing team ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("eval-team-demo-lead").first()).toBeVisible();
    await expect(page.getByText("eval-team-demo-frontend").first()).toBeVisible();
    await expect(page.getByText(/No coding started/i)).toBeVisible();

    await gotoWithTheme(page, "/agents", "light");
    await expect(page.getByText("eval-team-demo-lead").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("eval-team-demo-qa").first()).toBeVisible();

    await gotoWithTheme(page, "/projects?open=eval-team-demo", "light");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("eval-team-demo-lead").first()).toBeVisible();
  });
});

import { expect, test } from "./fixtures";
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
    await expect(page.getByText(/No coding started|No execution started/i)).toBeVisible();

    await gotoWithTheme(page, "/agents", "light");
    await expect(page.getByText("eval-team-demo-lead").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("eval-team-demo-qa").first()).toBeVisible();

    await gotoWithTheme(page, "/projects?open=eval-team-demo", "light");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("eval-team-demo-lead").first()).toBeVisible();
  });

  test("vague novel staffing asks for roles instead of inventing software specialists", async ({ page }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "I want to write a novel. Staff a standing team for project work named my-first-novel. Show the hierarchy. Do not start writing yet.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.locator("#question-standing-team-roles")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("my-first-novel-frontend")).toHaveCount(0);
    await expect(page.getByText("Standing team ready")).toHaveCount(0);
  });
});

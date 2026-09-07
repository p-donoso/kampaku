import { expect, test } from "./fixtures";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;

/**
 * Locks docs/eval/05-intent-to-work.md: vague improve clarifies before board flood.
 */
test.describe("eval suite 05 intent to work", () => {
  test("vague improve shows next-intent question and leaves work board empty", async ({ page, request }) => {
    const before = await request.get(`${CORE_URL}/api/v1/projects/kampaku`);
    expect(before.ok()).toBeTruthy();
    const beforeBody = (await before.json()) as { workItems?: unknown[] };
    const beforeCount = beforeBody.workItems?.length ?? 0;

    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill("Improve the project. Make it better. Start now.");
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Clarify before planning")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#question-intent-next-focus")).toBeVisible();
    await expect(page.getByText("Quality and reliability")).toBeVisible();
    await expect(page.getByText(/missing foundation|already exists/i).first()).toBeVisible();

    await page.getByLabel("Defer — do not create work yet").check();
    await page.getByRole("button", { name: /^Answer/i }).click();

    const after = await request.get(`${CORE_URL}/api/v1/projects/kampaku`);
    expect(after.ok()).toBeTruthy();
    const afterBody = (await after.json()) as { workItems?: unknown[] };
    expect(afterBody.workItems?.length ?? 0).toBe(beforeCount);

    await gotoWithTheme(page, "/projects?open=kampaku", "light");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  });
});

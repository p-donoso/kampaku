import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

const MARKER = "EVAL-SURFACE-MARKER";
const coreURL = process.env.PLAYWRIGHT_CORE_URL ?? "http://127.0.0.1:18080";

/**
 * Locks docs/eval/02-three-surfaces.md: chat mutation + web + confirm parity.
 */
test.describe("eval suite 02 three surfaces", () => {
  test("chat sets marker; projects UI and follow-up chat share the same id", async ({ page, request }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Pick one existing project. Set a short note I can recognize: EVAL-SURFACE-MARKER. Confirm the id.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Surface marker applied")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MARKER).first()).toBeVisible();

    const idMatch = (await page.locator("body").innerText()).match(
      /id[`:\s]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    expect(idMatch?.[1]).toBeTruthy();
    const projectId = idMatch![1]!;

    const api = await request.get(`${coreURL}/api/v1/projects/kampaku`);
    expect(api.ok()).toBeTruthy();
    const overview = (await api.json()) as { project: { id: string; description?: string | null } };
    expect(overview.project.id).toBe(projectId);
    expect(overview.project.description).toBe(MARKER);

    await gotoWithTheme(page, "/projects?open=kampaku", "light");
    await expect(page.getByText(MARKER).first()).toBeVisible({ timeout: 15_000 });

    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Confirm the current project description marker for kampaku.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Project surface check")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MARKER).first()).toBeVisible();
    await expect(page.getByText(projectId).first()).toBeVisible();
  });

  test("web edit of description persists and matches API", async ({ page, request }) => {
    const marker = `${MARKER}-WEB`;
    await request.patch(`${coreURL}/api/v1/projects/kampaku`, {
      data: { description: "reset-before-web-edit" },
    });

    await gotoWithTheme(page, "/projects?open=kampaku", "light");
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("reset-before-web-edit")).toBeVisible({ timeout: 15_000 });
    await panel.getByRole("button", { name: "Edit", exact: true }).click();
    const description = panel.locator("textarea").first();
    await expect(description).toBeVisible();
    await description.fill(marker);
    const patch = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/projects/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await panel.getByRole("button", { name: "Save changes" }).click();
    await patch;
    await expect(panel.getByText(marker, { exact: true })).toBeVisible({ timeout: 15_000 });

    const api = await request.get(`${coreURL}/api/v1/projects/kampaku`);
    const overview = (await api.json()) as { project: { description?: string | null } };
    expect(overview.project.description).toBe(marker);
  });
});

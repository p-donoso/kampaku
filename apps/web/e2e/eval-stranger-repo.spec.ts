import { expect, test } from "./fixtures";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH = process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-stranger-${process.pid}`;

/**
 * Locks docs/eval/06-stranger-repo.md: outsider path seeded and linked in project UI.
 */
test.describe("eval suite 06 stranger repo", () => {
  test("chat bootstraps stranger OSS path; project UI shows linked repo", async ({ page, request }) => {
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Stranger project ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(STRANGER_PATH).first()).toBeVisible();
    await expect(page.getByText("node hello.js").first()).toBeVisible();

    const projects = await request.get(`${CORE_URL}/api/v1/projects`);
    expect(projects.ok()).toBeTruthy();
    const body = (await projects.json()) as {
      projects: Array<{ slug: string; repositories?: Array<{ url: string }> }>;
    };
    const linked = body.projects.find((project) =>
      (project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    );
    expect(linked).toBeTruthy();
    expect(linked!.slug).not.toBe("kampaku");

    await gotoWithTheme(page, `/projects?open=${linked!.slug}`, "light");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(STRANGER_PATH).first()).toBeVisible();
  });
});

import { expect, test } from "./fixtures";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH =
  process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-wiki-stranger-${process.pid}`;

/**
 * Locks docs/eval/09-shared-truth.md: published wiki matches stranger disk; UI shows pages.
 * Bootstrap → plan → execute → publish via API; UI turn points emperor at pages.
 */
test.describe("eval suite 09 shared truth", () => {
  test("publish shared knowledge; wiki UI shows honest published pages", async ({ page, request }) => {
    for (const message of [
      `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
      "For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.",
      "Execute the approved Hello Eval plan on the stranger project only. Show progress. Stop and ask if you hit a wall.",
      "Update the project's shared knowledge so it reflects what is actually implemented for Hello Eval. Mark anything not built as future. Do not invent endpoints or libraries.",
    ]) {
      const res = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, { data: { message } });
      expect(res.ok()).toBeTruthy();
    }

    const projects = await request.get(`${CORE_URL}/api/v1/projects`);
    const list = (await projects.json()) as {
      projects: Array<{ slug: string; repositories?: Array<{ url: string }> }>;
    };
    const linked = list.projects.find((project) =>
      (project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    );
    expect(linked).toBeTruthy();

    const wiki = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}/wiki/pages/dev-setup`);
    expect(wiki.ok()).toBeTruthy();
    const wikiBody = (await wiki.json()) as { page: { contentMd: string; status: string } };
    expect(wikiBody.page.status).toBe("published");
    expect(wikiBody.page.contentMd).toMatch(/node hello\.js/);
    expect(wikiBody.page.contentMd).not.toMatch(/npm run build/);

    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Point me to the pages or docs I should read as emperor.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText(/Pages to read/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("current-implementation").first()).toBeVisible();

    await gotoWithTheme(page, "/projects/wiki", "light");
    await page.locator("select").first().selectOption(linked!.slug);
    await expect(page.getByRole("button", { name: "Current implementation" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Current implementation" }).click();
    await expect(page.getByText(/node hello\.js/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

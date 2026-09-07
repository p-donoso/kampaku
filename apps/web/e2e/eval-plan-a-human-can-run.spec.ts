import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH = process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-plan-stranger-${process.pid}`;

/**
 * Locks docs/eval/07-plan-a-human-can-run.md: multi-step plan visible with stable ids.
 * Bootstrap via chat API first so the UI turn is a single plan prompt (avoids Send-disabled flake).
 */
test.describe("eval suite 07 plan a human can run", () => {
  test("plan Hello Eval; project work shows todo steps", async ({ page, request }) => {
    const bootstrap = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message: `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
      },
    });
    expect(bootstrap.ok()).toBeTruthy();
    const bootstrapBody = (await bootstrap.json()) as { reply?: string };
    expect(bootstrapBody.reply).toMatch(/Stranger project ready/i);

    const projects = await request.get(`${CORE_URL}/api/v1/projects`);
    const list = (await projects.json()) as {
      projects: Array<{ slug: string; repositories?: Array<{ url: string }> }>;
    };
    const linked = list.projects.find((project) =>
      (project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    );
    expect(linked).toBeTruthy();

    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Human-readable plan proposed")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Waiting for your go/i)).toBeVisible();
    await expect(page.getByText("node hello.js").first()).toBeVisible();

    const detail = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    expect(detail.ok()).toBeTruthy();
    const body = (await detail.json()) as {
      workItems?: Array<{ item?: { title: string; status: string }; children?: unknown[] }>;
    };
    expect((body.workItems ?? []).length).toBeGreaterThanOrEqual(1);

    await gotoWithTheme(page, `/projects?open=${linked!.slug}`, "light");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .getByText("Verify seed entrypoint")
        .or(page.getByText("First stranger slice"))
        .or(page.getByText("Verify seed greeting"))
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });
});

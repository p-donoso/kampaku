import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH =
  process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-exec-stranger-${process.pid}`;

/**
 * Locks docs/eval/08-hands-off-execution.md: visible job + stranger disk deliverable.
 * Bootstrap + plan via API; UI turn is the emperor go-ahead only.
 */
test.describe("eval suite 08 hands-off execution", () => {
  test("execute approved Hello Eval; jobs API shows progress; index.html on stranger", async ({
    page,
    request,
  }) => {
    const bootstrap = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message: `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
      },
    });
    expect(bootstrap.ok()).toBeTruthy();

    const plan = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message:
          "For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.",
      },
    });
    expect(plan.ok()).toBeTruthy();
    const planBody = (await plan.json()) as { reply?: string };
    expect(planBody.reply).toMatch(/Human-readable plan proposed/i);

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
      "Execute the approved Hello Eval plan on the stranger project only. Show progress. Stop and ask if you hit a wall.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByText("Hello Eval execution complete")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Host monorepo was not modified/i)).toBeVisible();

    const jobsRes = await request.get(`${CORE_URL}/api/v1/jobs?project=${linked!.slug}`);
    expect(jobsRes.ok()).toBeTruthy();
    const jobsBody = (await jobsRes.json()) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(jobsBody.jobs.length).toBeGreaterThanOrEqual(1);
    const succeeded = jobsBody.jobs.find((job) => job.status === "succeeded");
    expect(succeeded).toBeTruthy();

    const detail = await request.get(`${CORE_URL}/api/v1/jobs/${succeeded!.id}`);
    expect(detail.ok()).toBeTruthy();
    const detailBody = (await detail.json()) as { logs?: Array<{ line: string }> };
    expect((detailBody.logs ?? []).some((entry) => /Leaf done/i.test(entry.line))).toBe(true);

    expect(readFileSync(join(STRANGER_PATH, "index.html"), "utf8")).toContain("Hello Eval");
  });
});

import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH =
  process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-survive-stranger-${process.pid}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Locks docs/eval/13-survive-interruption.md: durable job, cancel stops writes, API status truthful.
 */
test.describe("eval suite 13 survive interruption", () => {
  test("start durable batch; cancel stops writes; job status cancelled on API", async ({
    page,
    request,
  }) => {
    const bootstrap = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message: `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
      },
    });
    expect(bootstrap.ok()).toBeTruthy();

    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Start a long-running but safe task I can interrupt (for example generate many small files in the stranger project). Tell me when it is running.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByRole("heading", { name: /Durable execution running/i })).toBeVisible({
      timeout: 30_000,
    });

    const projects = await request.get(`${CORE_URL}/api/v1/projects`);
    const list = (await projects.json()) as {
      projects: Array<{ slug: string; repositories?: Array<{ url: string }> }>;
    };
    const linked = list.projects.find((project) =>
      (project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    );
    expect(linked).toBeTruthy();

    const jobsRes = await request.get(`${CORE_URL}/api/v1/jobs?project=${linked!.slug}`);
    expect(jobsRes.ok()).toBeTruthy();
    const jobsBody = (await jobsRes.json()) as {
      jobs: Array<{ id: string; status: string }>;
    };
    const running = jobsBody.jobs.find((job) => job.status === "running") ?? jobsBody.jobs[0];
    expect(running).toBeTruthy();

    await sleep(150);
    const cancel = await request.post(`${CORE_URL}/api/v1/jobs/${running!.id}/cancel`);
    expect(cancel.ok()).toBeTruthy();
    await sleep(300);

    const detail = await request.get(`${CORE_URL}/api/v1/jobs/${running!.id}`);
    expect(detail.ok()).toBeTruthy();
    const detailBody = (await detail.json()) as { status: string };
    expect(detailBody.status).toBe("cancelled");

    const labDir = join(STRANGER_PATH, "interrupt-lab");
    const count = readdirSync(labDir).filter((name) => name.endsWith(".txt")).length;
    await sleep(250);
    const later = readdirSync(labDir).filter((name) => name.endsWith(".txt")).length;
    expect(later).toBe(count);
    expect(count).toBeGreaterThan(0);
  });
});

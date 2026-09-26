import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "28081"}`;

test.describe("current Kampaku orchestration contract", () => {
  test("routes implementation intent without mutating projects or agents", async ({
    page,
    request,
  }) => {
    const projectsBeforeResponse = await request.get(`${coreURL}/api/v1/projects`);
    const agentsBeforeResponse = await request.get(`${coreURL}/api/v1/agents`);
    expect(projectsBeforeResponse.ok()).toBeTruthy();
    expect(agentsBeforeResponse.ok()).toBeTruthy();
    const projectsBefore = (await projectsBeforeResponse.json()) as { projects: unknown[] };
    const agentsBefore = (await agentsBeforeResponse.json()) as { agents: unknown[] };

    await gotoWithTheme(page, "/chat", "light");
    await page
      .getByPlaceholder(/tell kampaku/i)
      .fill("Create a scientific calculator project, delegate it, and start coding now.");
    await page.getByRole("button", { name: /send/i }).click();

    await expect(page.getByText(/responsible project lead/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/i);

    const projectsAfterResponse = await request.get(`${coreURL}/api/v1/projects`);
    const agentsAfterResponse = await request.get(`${coreURL}/api/v1/agents`);
    const projectsAfter = (await projectsAfterResponse.json()) as { projects: unknown[] };
    const agentsAfter = (await agentsAfterResponse.json()) as { agents: unknown[] };

    expect(projectsAfter.projects).toEqual(projectsBefore.projects);
    expect(agentsAfter.agents).toEqual(agentsBefore.agents);
  });
});

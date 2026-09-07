import { expect, test } from "@playwright/test";
import { gotoWithTheme } from "./helpers/theme";

const CORE_URL = process.env.KAMPAKU_CORE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;
const STRANGER_PATH =
  process.env.PLAYWRIGHT_STRANGER_PATH ?? `/tmp/kampaku-e2e-operator-stranger-${process.pid}`;

type WorkNode = { item?: { id: string; title: string }; children?: WorkNode[] };

function flattenWork(nodes: WorkNode[]): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = [];
  for (const node of nodes) {
    if (node.item?.id) out.push({ id: node.item.id, title: node.item.title });
    if (node.children?.length) out.push(...flattenWork(node.children));
  }
  return out;
}

/**
 * Locks docs/eval/16-operator-ui.md: six click-through journeys + P3 human gate in UI.
 */
test.describe("eval suite 16 operator ui", () => {
  test("chat, pending Q, board, wiki approve, agents, edit+save x2", async ({ page, request }) => {
    test.setTimeout(120_000);

    const bootstrap = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message: `Create a new minimal open-source project at ${STRANGER_PATH} linked as its own Kampaku project. Seed only what is needed to start: git, README with install/run/test that match reality, LICENSE, basic CI stub if appropriate. Do not invent a stack that is not on disk. Do not modify the Kampaku monorepo.`,
      },
    });
    expect(bootstrap.ok()).toBeTruthy();

    const projects = await request.get(`${CORE_URL}/api/v1/projects`);
    const list = (await projects.json()) as {
      projects: Array<{
        id: string;
        slug: string;
        repositories?: Array<{ url: string }>;
        projectLeadAgentId?: string | null;
      }>;
    };
    const linked = list.projects.find((project) =>
      (project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    );
    expect(linked).toBeTruthy();

    const staffStranger = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
      data: {
        message: `Staff a standing team for project ${linked!.slug} with frontend, backend, and qa. Do not start coding or execution.`,
      },
    });
    expect(staffStranger.ok()).toBeTruthy();

    // Seed plan only when the board is empty (retries share the data dir).
    const beforePlan = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    const beforePlanBody = (await beforePlan.json()) as { workItems?: WorkNode[] };
    if (flattenWork(beforePlanBody.workItems ?? []).length === 0) {
      const plan = await request.post(`${CORE_URL}/api/v1/agents/kampaku/chat`, {
        data: {
          message:
            "For the stranger project, plan a tiny web app: one page that shows Hello Eval, with install, run, and a basic test. Break the work into steps a human could follow without you. Include exact check commands. Do not mark anything done. Wait for my go before large execution.",
        },
      });
      expect(plan.ok()).toBeTruthy();
    }

    // --- A. Chat markdown + package-manager gate ---
    await gotoWithTheme(page, "/chat", "light");
    await page.getByPlaceholder(/tell kampaku/i).fill(
      "Ask me one blocking question about preferred package manager for the stranger project, then wait.",
    );
    await page.getByRole("button", { name: /send/i }).click();
    await expect(page.getByRole("heading", { name: /Human gate — package manager/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".chat-markdown").first()).toBeVisible();
    await expect(page.locator("#question-package-manager-preference").first()).toBeVisible();

    const pendingApi = await request.get(`${CORE_URL}/api/v1/questions?status=pending`);
    expect(pendingApi.ok()).toBeTruthy();
    const pendingBody = (await pendingApi.json()) as {
      questions: Array<{ id: string; question: string }>;
    };
    const pkgQuestion = pendingBody.questions.find((item) =>
      item.question.includes("package-manager-preference"),
    );
    expect(pkgQuestion?.id).toBeTruthy();

    // --- B. Pending Q answer in UI (P3) ---
    await gotoWithTheme(page, "/", "light");
    await page.getByRole("link", { name: /Pending questions/i }).click();
    await expect(page.locator("#pending-questions")).toBeVisible();
    const pendingCard = page
      .locator("#pending-questions article")
      .filter({ has: page.locator("#question-package-manager-preference") })
      .first();
    await expect(pendingCard).toBeVisible({ timeout: 15_000 });
    await pendingCard.getByLabel(/^npm$/i).check();
    await pendingCard.getByRole("button", { name: /^Answer/i }).click();
    await expect(pendingCard).toHaveCount(0, { timeout: 15_000 });

    const afterQ = await request.get(`${CORE_URL}/api/v1/questions?status=pending`);
    const afterBody = (await afterQ.json()) as { questions: Array<{ id: string }> };
    expect(afterBody.questions.some((item) => item.id === pkgQuestion!.id)).toBe(false);

    // --- C. Work board → item detail ---
    const overview = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    expect(overview.ok()).toBeTruthy();
    const overviewBody = (await overview.json()) as { workItems?: WorkNode[] };
    const flat = flattenWork(overviewBody.workItems ?? []);
    const firstTask =
      flat.find((item) => /verify|install|hello|readme|test/i.test(item.title)) ?? flat[0];
    expect(firstTask?.id).toBeTruthy();

    await gotoWithTheme(page, `/projects?open=${linked!.slug}`, "light");
    const projectPanel = page.getByRole("dialog");
    await expect(projectPanel).toBeVisible({ timeout: 15_000 });
    await expect(
      projectPanel
        .getByText(firstTask!.title)
        .or(projectPanel.getByText("First stranger slice"))
        .or(projectPanel.getByText("Hello Eval plan"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    const clickTitle = (await projectPanel.getByText(firstTask!.title).count())
      ? firstTask!.title
      : (await projectPanel.getByText("First stranger slice").count())
        ? "First stranger slice"
        : "Hello Eval plan";
    await projectPanel.getByText(clickTitle).first().click();
    await expect(page).toHaveURL(new RegExp(`task=`), { timeout: 15_000 });
    await expect(page.getByRole("dialog").getByText(clickTitle).first()).toBeVisible({
      timeout: 15_000,
    });

    // --- D. Wiki view + approve pending ---
    const refreshed = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    const refreshedBody = (await refreshed.json()) as {
      project: { projectLeadAgentId?: string | null };
    };
    expect(refreshedBody.project.projectLeadAgentId).toBeTruthy();

    const agents = await request.get(`${CORE_URL}/api/v1/agents`);
    const agentsBody = (await agents.json()) as {
      tree?: Array<{ agent: { id: string; slug: string }; children?: unknown[] }>;
      agents?: Array<{ id: string; slug: string }>;
    };
    function findSlug(
      nodes: Array<{ agent: { id: string; slug: string }; children?: unknown[] }> | undefined,
      id: string,
    ): string | null {
      if (!Array.isArray(nodes)) return null;
      for (const node of nodes) {
        if (node.agent.id === id) return node.agent.slug;
        const nested = findSlug((node.children as typeof nodes) ?? [], id);
        if (nested) return nested;
      }
      return null;
    }
    const leadSlug =
      findSlug(agentsBody.tree, refreshedBody.project.projectLeadAgentId!) ??
      agentsBody.agents?.find((agent) => agent.id === refreshedBody.project.projectLeadAgentId)?.slug ??
      null;
    expect(leadSlug).toBeTruthy();

    const propose = await request.post(
      `${CORE_URL}/api/v1/projects/${linked!.slug}/wiki/pages/dev-setup/propose`,
      {
        data: {
          agent_slug: leadSlug,
          content_md: "# Development setup\n\nOperator UI approved content.\n",
        },
      },
    );
    if (!propose.ok()) {
      const proposeErr = await propose.text();
      throw new Error(`wiki propose failed ${propose.status()}: ${proposeErr}`);
    }

    await gotoWithTheme(page, "/projects/wiki", "light");
    await page.locator("select").first().selectOption(linked!.slug);
    await page.getByRole("button", { name: /Development setup/i }).click();
    await expect(page.getByText("Pending edit")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Approve edit/i }).click();
    await expect(page.getByText("Pending edit")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/Operator UI approved content/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const wikiAfter = await request.get(
      `${CORE_URL}/api/v1/projects/${linked!.slug}/wiki/pages/dev-setup`,
    );
    const wikiBody = (await wikiAfter.json()) as {
      page: { contentMd: string };
      pendingEdit?: unknown | null;
    };
    expect(wikiBody.page.contentMd).toMatch(/Operator UI approved content/);
    expect(wikiBody.pendingEdit == null).toBe(true);

    // --- E. Agents hierarchy ---
    await gotoWithTheme(page, "/agents", "light");
    await expect(page.getByText(leadSlug!, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // --- F. Edit+save project ---
    const projectMarker = `EVAL-OPERATOR-UI-${Date.now()}`;
    await gotoWithTheme(page, `/projects?open=${linked!.slug}`, "light");
    const editProject = page.getByRole("dialog");
    await expect(editProject).toBeVisible({ timeout: 15_000 });
    await editProject.getByRole("button", { name: "Edit", exact: true }).click();
    const description = editProject.locator("textarea").first();
    await description.fill(projectMarker);
    const projectPatch = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/projects/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await editProject.getByRole("button", { name: "Save changes" }).click();
    await projectPatch;
    const projectApi = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    const projectJson = (await projectApi.json()) as { project: { description?: string | null } };
    expect(projectJson.project.description).toBe(projectMarker);

    // --- F2. Edit+save agent (second entity) ---
    const agentMarker = `operator-ui-agent-${Date.now()}`;
    await gotoWithTheme(page, `/agents?agent=${leadSlug}`, "light");
    const agentPanel = page.getByRole("dialog");
    await expect(agentPanel).toBeVisible({ timeout: 15_000 });
    await agentPanel.getByRole("button", { name: "Edit", exact: true }).click();
    const responsibilities = agentPanel.locator("textarea").first();
    await responsibilities.fill(agentMarker);
    const agentPatch = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/agents/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await agentPanel.getByRole("button", { name: "Save changes" }).click();
    await agentPatch;
    const agentApi = await request.get(`${CORE_URL}/api/v1/agents/${leadSlug}`);
    const agentJson = (await agentApi.json()) as { responsibilities?: string };
    expect(agentJson.responsibilities).toBe(agentMarker);

    // Soft: stranger path linked on the project (API + description already covered in suite 06 UI)
    const linkedCheck = await request.get(`${CORE_URL}/api/v1/projects/${linked!.slug}`);
    const linkedJson = (await linkedCheck.json()) as {
      project: { repositories?: Array<{ url: string }> };
    };
    expect(
      (linkedJson.project.repositories ?? []).some((repo) => repo.url.includes(STRANGER_PATH)),
    ).toBe(true);
  });
});

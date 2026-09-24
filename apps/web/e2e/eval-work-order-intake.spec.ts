import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/** The monorepo root, found by walking up rather than assuming a cwd. */
function repoRoot(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "apps/core/dist/cli.js"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the monorepo root from " + __dirname);
}

/**
 * Suite 01's other lock: **the container is visible in the UI, with the same slug and path.**
 *
 * The suite's Automated-tests table names this file as *to author* alongside the core lock. Its subject
 * is the third surface: the core test proves a container opens from chat and that the stores agree, and
 * this proves the operator can see the result in the web UI rather than only in a terminal.
 *
 * Three surfaces agreeing is the suite's own bullet, and the UI is the one that has never been driven in
 * any run of this record — every run's oracle says some variant of *"the UI was not driven"*. That is
 * why U3 has been `partial` since run 3.
 *
 * **Discovery while writing this, recorded rather than worked around:** the project summary panel renders
 * `project.repositories.length` — a **count**. The repository *path* is never shown in the UI, while
 * `get_project` and the durable-state block both carry urls. Suite [02](../../../../docs/eval/02-three-surfaces.md)
 * forbids exactly that: *"The repository path is shown as a path string on every surface that shows
 * project metadata — not replaced by a count that cannot be verified against disk."* BOARD F-034.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;

/** The container this spec measures, created on disk outside the platform checkout. */
const PROJECT_SLUG = "eval-intake-demo";
const PROJECT_NAME = "Eval Intake Demo";

/**
 * Created through the documented REST API rather than through chat. The chat path is the *other* lock's
 * subject; this spec is about whether the UI shows what the API holds, so creating it the same way it
 * asserts reading it keeps the two failures distinguishable.
 */
type CoreRequest = {
  get: (url: string) => Promise<{ ok: () => boolean; text: () => Promise<string> }>;
  post: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
};

async function createContainer(request: CoreRequest): Promise<{ id: string; repositoryPath: string }> {
  const repositoryPath = join(tmpdir(), PROJECT_SLUG);
  // The directory has to exist before it can be linked. The product refuses a repository path that is
  // not a real directory — that is the whole point of the check — so a spec that skipped this would be
  // measuring its own fixture rather than the product.
  mkdirSync(repositoryPath, { recursive: true });

  // Idempotent on purpose, and not only for convenience: a **duplicate slug answers 500 with a bare
  // "Internal Server Error"** and no explanation, so a spec that re-POSTed would be asserting against
  // an unreadable failure rather than against the product. Recorded as BOARD F-035.
  const existing = await request.get(`${coreURL}/api/v1/projects/${PROJECT_SLUG}`);
  if (existing.ok()) {
    const found = JSON.parse((await existing.text()) || "{}") as { project?: { id?: string } };
    return { id: String(found.project?.id ?? ""), repositoryPath };
  }

  const response = await request.post(`${coreURL}/api/v1/projects`, {
    data: {
      slug: PROJECT_SLUG,
      name: PROJECT_NAME,
      description: "Container created by the suite-01 UI lock.",
      repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
    },
  });
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`POST /api/v1/projects failed (${response.status()}): ${body}`);
  }
  const created = JSON.parse(body || "{}") as { id?: string };
  return { id: String(created.id ?? ""), repositoryPath };
}

test.describe("eval 01 — the container is visible in the UI", () => {
  test("shows the container with the slug and status the API reports", async ({ page, request }) => {
    const { repositoryPath } = await createContainer(request);

    const apiResponse = await request.get(`${coreURL}/api/v1/projects`);
    expect(apiResponse.ok()).toBeTruthy();
    const api = (await apiResponse.json()) as {
      projects: Array<{ slug: string; status: string; repositories: Array<{ url: string }> }>;
    };
    const fromApi = api.projects.find((project) => project.slug === PROJECT_SLUG);
    // The premise: the API holds the container this spec is about to look for.
    expect(fromApi).toBeDefined();
    // And the path it holds is the one the request asked for, which exists on disk.
    expect(fromApi!.repositories[0]!.url).toBe(`file://${repositoryPath}`);

    await gotoWithTheme(page, "/projects", "light");

    // The slug is rendered in the roster, and it is the same string the API returned. This is the
    // three-surface parity bullet, measured on the surface that was never driven.
    await expect(page.getByText(PROJECT_SLUG, { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    // The human name, so the row is identifiable rather than only machine-readable.
    await expect(page.getByText(PROJECT_NAME, { exact: true }).first()).toBeVisible();
    // And the status, so the UI is not showing a different lifecycle state than the API.
    await expect(page.getByText(fromApi!.status as string, { exact: true }).first()).toBeVisible();
  });

  test("opens the container's detail and shows the same slug there too", async ({ page, request }) => {
    await createContainer(request);
    await gotoWithTheme(page, "/projects", "light");

    // Clicking the row's slug opens the detail **dialog**; the same slug has to survive the transition,
    // or the roster and the detail disagree about which entity is being shown.
    await page.getByText(PROJECT_SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole("heading", { name: PROJECT_NAME })).toBeVisible();

    // The dialog opens on Tasks, so the Summary tab has to be selected before the metadata is read.
    // Measured here rather than assumed: the first version of this spec asserted the labels straight
    // after the click and failed against a correctly-rendered Tasks tab.
    await dialog.getByRole("button", { name: "Summary" }).click();
    await expect(dialog.getByText("Slug", { exact: true })).toBeVisible({ timeout: 20_000 });
    // `first()` because the dialog renders the slug twice on purpose: once in its header and once as the
    // Summary field. Two matches is the correct state, not an ambiguity to resolve in the product.
    await expect(dialog.getByText(PROJECT_SLUG, { exact: true }).first()).toBeVisible();
  });

  /**
   * The third surface, which the suite requires and no run of this record has ever driven.
   *
   * The CLI is a REST client, so this also proves the operation is reachable from the surface an
   * operator scripting the factory uses — suite 02's "anything REST can do, the CLI can do" bullet, on
   * the one capability suite 01 is about.
   */
  test("reports the same slug and repository path from the CLI as from the API", async ({ request }) => {
    const { repositoryPath } = await createContainer(request);

    // Spawned rather than imported: the point is the surface an operator actually runs, including its
    // argument parsing and its output formatting. `execFileSync` throws on a non-zero exit, so a CLI
    // that failed to reach core fails this test instead of silently asserting on empty output.
    const output = execFileSync(
      process.execPath,
      [join(repoRoot(), "apps/core/dist/cli.js"), "projects", "list"],
      {
        env: {
          ...process.env,
          KAMPAKU_CORE_URL: coreURL,
          // The repository's own `.env` sets KAMPAKU_CORE_URL=http://127.0.0.1:8080 and is loaded
          // afterwards, so without this the CLI reports "fetch failed" against a healthy core. This is
          // the documented trap that cost runs 1–2 of the baseline real time; `0` preserves the explicit
          // process value instead.
          KAMPAKU_DOTENV_OVERRIDE: "0",
        },
        encoding: "utf8",
      },
    );

    expect(output).toContain(PROJECT_SLUG);
    expect(output).toContain(PROJECT_NAME);
    // And the **path**, which this assertion used to require to be absent. That was the finding at the
    // time — `projects list` printed `slug  name  [status]` and nothing about repositories (BOARD
    // F-034) — and the assertion is inverted rather than dropped, so a regression fails here.
    expect(output).toContain(repositoryPath);
  });

  /**
   * The gap, asserted as an inventory rather than as a wish.
   *
   * This is the shape suite 02 measures directly, and the assertion is written so that fixing F-034
   * fails here and forces the row to be closed deliberately instead of silently.
   */
  test("shows the repository path as a path on BOTH surfaces an operator reads", async ({
    page,
    request,
  }) => {
    const { repositoryPath } = await createContainer(request);

    // The web UI, measured on the rendered DOM rather than on the source.
    await gotoWithTheme(page, "/projects", "light");
    await page.getByText(PROJECT_SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Summary" }).click();

    // The label is singular or plural with the count, and the **path** is what is rendered under it.
    // This test used to assert the opposite — that neither surface showed the path — which is what
    // F-034 recorded. The assertion is inverted rather than deleted, so a regression fails here.
    await expect(dialog.getByText(/^Repositor(y|ies)$/)).toBeVisible({ timeout: 20_000 });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).toContain(repositoryPath);

    // And the CLI, which is the surface where an operator can check the path against disk.
    const cli = execFileSync(
      process.execPath,
      [join(repoRoot(), "apps/core/dist/cli.js"), "projects", "list"],
      {
        env: {
          ...process.env,
          KAMPAKU_CORE_URL: coreURL,
          KAMPAKU_DOTENV_OVERRIDE: "0",
        },
        encoding: "utf8",
      },
    );
    expect(cli).toContain(repositoryPath);
  });

  /**
   * The owner, on the surfaces that are not chat.
   *
   * `POST /api/v1/projects` took no lead and no REST route could create an agent, so a project created
   * through the documented route could never be owned and the roster rendered `Owner —` (BOARD F-036).
   * Both halves are exercised here: create the agent through REST, then open the container with it.
   */
  test("opens an OWNED work order through REST, and the UI shows the owner", async ({ page, request }) => {
    const leadSlug = "eval-intake-lead";
    const existing = await request.get(`${coreURL}/api/v1/agents/${leadSlug}`);
    if (!existing.ok()) {
      const created = await request.post(`${coreURL}/api/v1/agents`, {
        data: { slug: leadSlug, name: "Eval Intake Lead", responsibilities: "Own the work order" },
      });
      expect(created.status()).toBe(201);
    }

    const repositoryPath = join(tmpdir(), `${PROJECT_SLUG}-owned`);
    mkdirSync(repositoryPath, { recursive: true });
    const slug = `${PROJECT_SLUG}-owned`;
    const found = await request.get(`${coreURL}/api/v1/projects/${slug}`);
    if (!found.ok()) {
      const created = await request.post(`${coreURL}/api/v1/projects`, {
        data: {
          slug,
          name: "Eval Intake Demo Owned",
          repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
          project_lead_slug: leadSlug,
        },
      });
      expect(created.status()).toBe(201);
      const body = (await created.json()) as { projectLeadAgentId?: string };
      // The owner is recorded, which is what the route could not do before.
      expect(body.projectLeadAgentId).toBeTruthy();
    }

    await gotoWithTheme(page, "/projects", "light");
    // The README's own criterion: the roster shows the owner's slug, not a dash.
    await expect(page.getByText(leadSlug, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });

  /**
   * And a duplicate is a conflict, not a crash.
   *
   * Measured: the same POST with an existing slug answered `500 Internal Server Error` with a bare body
   * (BOARD F-035), so a caller retrying a create could not tell a duplicate from a broken server.
   */
  test("answers a duplicate slug with a named conflict, not a 500", async ({ request }) => {
    const { repositoryPath, id } = await createContainer(request);
    expect(id).toBeTruthy();

    const duplicate = await request.post(`${coreURL}/api/v1/projects`, {
      data: {
        slug: PROJECT_SLUG,
        name: PROJECT_NAME,
        repositories: [{ url: `file://${repositoryPath}`, role: "web" }],
      },
    });

    expect(duplicate.status()).toBe(409);
    const body = (await duplicate.json()) as { error?: string; code?: string };
    expect(body.code).toBe("CONFLICT");
    expect(String(body.error)).toMatch(/already exists/i);
  });
});

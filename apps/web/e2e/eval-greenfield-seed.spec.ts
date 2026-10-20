import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 06's third-surface lock: **the project the factory seeded, seen from the browser.**
 *
 * The suite's checklist asks for U3 in this suite's own terms — *"Project slug and path agree across chat,
 * CLI, and web"* — and the artifact under test is a checkout the factory stood up on disk. Two of the three
 * surfaces were driven in the run (`kampaku chat` opened the container; `kampaku projects list` prints its
 * path); this drives the third against the same live instance rather than against a fixture this spec
 * creates, because the question is whether the operator can see the seeded project, not whether a project
 * can be seen.
 *
 * It is deliberately read-only. A spec that created a project here would measure its own setup.
 *
 * Run it against the run's data dir:
 *
 *     PLAYWRIGHT_CORE_DATA_DIR=/home/pdonoso/.kampaku-eval-06/data \
 *       npx playwright test e2e/eval-greenfield-seed.spec.ts
 */

const SLUG = process.env.EVAL_SEED_PROJECT ?? "seed-demo";

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

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "28081"}`;

test.describe("eval 06 — the seeded project is the same project on every surface", () => {
  test("the browser shows the container the chat opened, with the repository path REST reports", async ({
    page,
    request,
  }) => {
    const apiResponse = await request.get(`${coreURL}/api/v1/projects`);
    expect(apiResponse.ok()).toBeTruthy();
    const api = (await apiResponse.json()) as {
      projects: Array<{
        slug: string;
        status: string;
        repositories: Array<{ url: string }>;
      }>;
    };
    const fromApi = api.projects.find((project) => project.slug === SLUG);
    // The premise: the run's own container exists, and it holds a repository path.
    expect(fromApi, `project ${SLUG} exists on the instance under test`).toBeDefined();
    const repositoryURL = fromApi!.repositories[0]!.url;
    expect(repositoryURL.startsWith("file://")).toBeTruthy();
    const repositoryPath = repositoryURL.slice("file://".length);
    // And that path is a real directory: the suite's whole point is that the recorded link is not a claim
    // about nothing.
    expect(existsSync(repositoryPath), `${repositoryPath} exists on disk`).toBeTruthy();

    await gotoWithTheme(page, "/projects", "light");
    await expect(page.getByText(SLUG, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // The detail panel is where repository metadata lives, and the path is what it must show — a count
    // cannot be checked against disk (suite 02's wording, BOARD F-034).
    await page.getByText(SLUG, { exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    // `exact` because this dialog is now populated: the plan the intake applied puts work-item rows in it,
    // and one of them is titled *Reconcile parity and wiki …*, which a substring match resolves to "Summary"
    // as well. Measured 2026-10-19 (run `s06r9`): the locator hit two elements and Playwright's strict mode
    // refused to guess, which is a spec defect rather than a product one — the tab it wants is on screen.
    await dialog.getByRole("button", { name: "Summary", exact: true }).click();
    await expect(dialog.getByText(repositoryPath, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("the CLI reports the same slug and repository path as REST", async ({ request }) => {
    const apiResponse = await request.get(`${coreURL}/api/v1/projects`);
    const api = (await apiResponse.json()) as {
      projects: Array<{ slug: string; repositories: Array<{ url: string }> }>;
    };
    const fromApi = api.projects.find((project) => project.slug === SLUG);
    expect(fromApi).toBeDefined();
    const repositoryPath = fromApi!.repositories[0]!.url.slice("file://".length);

    const output = execFileSync(
      process.execPath,
      [join(repoRoot(), "apps/core/dist/cli.js"), "projects", "list"],
      {
        env: {
          ...process.env,
          KAMPAKU_CORE_URL: coreURL,
          // The repository's own `.env` sets KAMPAKU_CORE_URL to port 8080 and is loaded afterwards, so
          // without this the CLI reports "fetch failed" against a healthy Core.
          KAMPAKU_DOTENV_OVERRIDE: "0",
        },
        encoding: "utf8",
      },
    );

    // One identity, one spelling: the slug and the path are the strings REST returned, not near-misses.
    expect(output).toContain(SLUG);
    expect(output).toContain(repositoryPath);
  });
});

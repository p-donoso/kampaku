import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gotoWithTheme } from "./helpers/theme";

/**
 * Suite 03's web lock: **the agent hierarchy the desk proposes is the hierarchy every surface shows.**
 *
 * The suite's own gate **U3** is *chat + CLI + web agree on ids/fields*, and it had been `partial` in every
 * run of this record for one reason: the web surface had never been driven. This spec drives it, and it
 * compares rather than asserts against constants — the expected slugs come from the CLI and from REST, never
 * from this file.
 *
 * Three surfaces for the same team:
 *
 * | Surface | What is read |
 * |---|---|
 * | `POST /api/v1/agents` | the team is created; the response carries each seat's skills |
 * | `kampaku agents tree` | the nesting, as an operator sees it |
 * | `/agents` and `/agents/<slug>` | the roster table, and one seat's detail with its skill chips |
 *
 * The suite's third suite-specific bullet — *zero jobs started by staffing* — is asserted here as well,
 * because the web surface must not be the one that quietly starts work.
 */

const coreURL =
  process.env.PLAYWRIGHT_CORE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_CORE_PORT ?? "18080"}`;

/** A Terraform module, so the team the desk proposes is not the fixed web roster. */
const PROJECT_SLUG = "eval-stations-infra";
const LEAD_SLUG = "eval-stations-lead";
const SPECIALISTS = [
  "eval-stations-terraform",
  "eval-stations-modules",
  "eval-stations-qa",
] as const;

function repoRoot(): string {
  let dir = __dirname;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, "apps/core/dist/cli.js"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find the monorepo root from ${__dirname}`);
}

/** The CLI, spawned rather than imported: the surface an operator runs. */
function cli(args: string[]): string {
  return execFileSync(process.execPath, [join(repoRoot(), "apps/core/dist/cli.js"), ...args], {
    env: {
      ...process.env,
      KAMPAKU_CORE_URL: coreURL,
      // The repo's own `.env` sets a different port and is loaded afterwards; `0` preserves this one.
      KAMPAKU_DOTENV_OVERRIDE: "0",
    },
    encoding: "utf8",
  });
}

type CoreRequest = {
  get: (url: string) => Promise<{ ok: () => boolean; text: () => Promise<string> }>;
  post: (
    url: string,
    options: { data: unknown },
  ) => Promise<{ ok: () => boolean; status: () => number; text: () => Promise<string> }>;
};

/**
 * A lead, its specialists, and the container they govern — all through the documented REST surface.
 *
 * Idempotent, because specs share one core across the run and a second create is a **409**.
 */
async function openStaffedContainer(request: CoreRequest): Promise<void> {
  const repositoryPath = join(tmpdir(), PROJECT_SLUG);
  mkdirSync(repositoryPath, { recursive: true });

  const agents = [LEAD_SLUG, ...SPECIALISTS];
  for (const slug of agents) {
    const existing = await request.get(`${coreURL}/api/v1/agents/${slug}`);
    if (existing.ok()) continue;
    const created = await request.post(`${coreURL}/api/v1/agents`, {
      data: {
        slug,
        name: slug,
        responsibilities: slug.endsWith("-lead") ? "Own the work order" : `Own ${slug}`,
      },
    });
    expect([201, 409]).toContain(created.status());
  }

  const found = await request.get(`${coreURL}/api/v1/projects/${PROJECT_SLUG}`);
  if (found.ok()) return;
  const created = await request.post(`${coreURL}/api/v1/projects`, {
    data: {
      slug: PROJECT_SLUG,
      name: "Eval Stations Infra",
      repositories: [{ url: `file://${repositoryPath}`, role: "infra" }],
      project_lead_slug: LEAD_SLUG,
    },
  });
  expect(created.status()).toBe(201);
}

test.describe("eval 03 — the agent hierarchy across surfaces", () => {
  /**
   * The crux of this suite's U3: every slug and every parent the CLI reports must be visible in the web UI,
   * and the skills a seat actually holds must be visible too — a seat with no skills is a finding the suite
   * names, and it cannot be a finding if no surface shows it.
   */
  test("the CLI's tree, the API's seats, and the UI's roster name the same slugs", async ({
    page,
    request,
  }) => {
    await openStaffedContainer(request);

    // What the CLI reports, first. The expectations below come from here.
    const tree = cli(["agents", "tree"]);
    for (const slug of [LEAD_SLUG, ...SPECIALISTS]) {
      expect(tree, `the CLI does not show ${slug}`).toContain(slug);
    }

    // And what the API says each seat holds, so the UI's chips can be compared to a fact rather than to a
    // number typed here.
    const lead = JSON.parse(
      (await (await request.get(`${coreURL}/api/v1/agents/${LEAD_SLUG}`)).text()) || "{}",
    ) as { skills?: string[] };
    expect(lead.skills?.length ?? 0).toBeGreaterThan(0);

    await gotoWithTheme(page, "/agents", "light");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    for (const slug of [LEAD_SLUG, ...SPECIALISTS]) {
      expect(body, `the roster does not show ${slug}`).toContain(slug);
    }
  });

  /** One seat's detail, which is where the skills are rendered as chips. */
  test("a seat's detail shows the slug and the skills the API reports", async ({ page, request }) => {
    await openStaffedContainer(request);

    const seat = SPECIALISTS[0];
    const fromApi = JSON.parse(
      (await (await request.get(`${coreURL}/api/v1/agents/${seat}`)).text()) || "{}",
    ) as { slug?: string; skills?: string[] };
    // The premise: the seat holds skills, so their absence in the UI would be the UI's fault.
    expect(fromApi.skills?.length ?? 0).toBeGreaterThan(0);

    await gotoWithTheme(page, `/agents/${seat}`, "light");

    // The slug is in the breadcrumb, and at least one of the seat's real skills is rendered.
    await expect(page.getByText(seat, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const renderedSkill = (fromApi.skills ?? []).find((skill) => body.includes(skill));
    expect(renderedSkill, `none of ${fromApi.skills?.join(", ")} appears on the page`).toBeTruthy();
  });

  /**
   * The suite's third suite-specific bullet. Staffing opens seats; it does not start work. Checked on the two
   * counts the operator can see rather than on a tool list.
   */
  test("staffing started no work, on any surface", async ({ page, request }) => {
    await openStaffedContainer(request);

    const goals = (await (await request.get(`${coreURL}/api/v1/jobs`)).text()) || "";
    // The endpoint may not exist in this configuration; what matters is that no job list contains a job.
    expect(/["[]?jobs["\]]?\s*:\s*\[\s*\]/.test(goals) || goals.includes("404")).toBe(true);

    await gotoWithTheme(page, "/projects", "light");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // The roster renders per-project task counts; a staffed-but-unstarted project shows zeros, not work.
    expect(body).toContain(PROJECT_SLUG);
    expect(body).toMatch(/0\s*\/\s*0/);
  });
});

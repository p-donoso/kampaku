import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

// The declared port block (scripts/ports.env, docs/development/local-ports.md). The fixture must not
// default to a port a live stack could be holding, or a run silently measures somebody else's instance.
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "28003";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const corePort = process.env.PLAYWRIGHT_CORE_PORT ?? "28081";
const coreURL = `http://127.0.0.1:${corePort}`;
const e2eDataDir = process.env.PLAYWRIGHT_CORE_DATA_DIR ?? `/tmp/kampaku-e2e-${process.pid}`;

/**
 * A scratch workspace that carries the **skill catalog** and nothing else.
 *
 * `KAMPAKU_WORKSPACE` is where `bootstrap` reads the catalog from, so with a bare scratch directory a seat
 * created during a spec inherits **zero skills** — and the three-surface gate then cannot be measured on a
 * field the fixture removed. Pointing it at the repository instead fixes the catalog and breaks something
 * worse: `loadWorkspaceEnv` would read the checkout's own `.env`, so the e2e instance would inherit the
 * developer's configuration — the agent flipped from `stub` to `llm` that way, and the run died on a missing
 * endpoint. Which is the Part A message doing its job, in a test harness, where it should not have been
 * needed at all.
 *
 * So the workspace is scratch, and only the catalog is linked in. The tests stay hermetic: no developer
 * `.env`, no credentials, and a seat that really holds the skills the catalog defines.
 */
const repoCheckout = resolve(__dirname, "../..");
const e2eWorkspace = process.env.PLAYWRIGHT_WORKSPACE ?? `/tmp/kampaku-e2e-workspace-${process.pid}`;
const catalogSource = join(repoCheckout, "packages/contracts/skills");
const catalogTarget = join(e2eWorkspace, "packages/contracts/skills");

if (!process.env.PLAYWRIGHT_WORKSPACE) {
  rmSync(e2eWorkspace, { recursive: true, force: true });
  mkdirSync(join(e2eWorkspace, "packages/contracts"), { recursive: true });
  symlinkSync(catalogSource, catalogTarget, "dir");
}
if (!existsSync(catalogTarget)) {
  throw new Error(`The e2e workspace has no skill catalog at ${catalogTarget}.`);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `npx tsx src/cli.ts serve -p ${corePort}`,
      cwd: "../core",
      url: `${coreURL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        KAMPAKU_AGENT: "stub",
        // **Both** planes, or the instance is not a stub instance.
        //
        // `KAMPAKU_AGENT=stub` stubs the chat/agent plane and leaves `KAMPAKU_PLANNER` on its shipped default of
        // `llm`, so `POST /api/v1/work-items/:id/execute` threw `An API key is required when KAMPAKU_PLANNER=llm`
        // and answered a bare `500` — measured 2026-11-04 while writing the suite-16 operator-journey lock, whose
        // execution journeys cannot be driven without a leasable job. The product's answer to that was itself a
        // defect and is fixed separately (BOARD F-134: the route now answers the planner's own sentence with
        // `409`); this line is the fixture's half, and it is what `kampaku dev` does when it selects stub mode.
        KAMPAKU_PLANNER: "stub",
        KAMPAKU_CORE_PORT: corePort,
        KAMPAKU_DATA_DIR: e2eDataDir,
        // Scratch, with the catalog linked in. See the note at the top of this file.
        KAMPAKU_WORKSPACE: e2eWorkspace,
        // The fixture creates the projects folder where the CLI does, and it must not be the operator's
        // home folder: the shipped default is `~/kampaku-projects`, so a run without this line would have
        // the e2e instance mkdir into `/home/<developer>`.
        KAMPAKU_PROJECTS_DIR: join(e2eDataDir, "kampaku-projects"),
      },
    },
    {
      command: `npm run dev -- -p ${webPort} -H 127.0.0.1`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        KAMPAKU_CORE_URL: coreURL,
      },
    },
  ],
});

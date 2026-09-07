import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "13002";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;
const corePort = process.env.PLAYWRIGHT_CORE_PORT ?? "18080";
const coreURL = `http://127.0.0.1:${corePort}`;
// Specs often read KAMPAKU_CORE_URL; do not inherit a workspace :8080 LLM core.
process.env.KAMPAKU_CORE_URL = coreURL;
process.env.PLAYWRIGHT_CORE_PORT = corePort;
const e2eDataDir = process.env.PLAYWRIGHT_CORE_DATA_DIR ?? `/tmp/kampaku-e2e-${process.pid}`;
const workspaceRoot = process.env.PLAYWRIGHT_WORKSPACE ?? `${process.cwd()}/../..`;

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
  globalSetup: "./e2e/global.setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
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
        KAMPAKU_PLANNER: "stub",
        KAMPAKU_DOTENV_OVERRIDE: "0",
        KAMPAKU_CORE_PORT: corePort,
        KAMPAKU_DATA_DIR: e2eDataDir,
        KAMPAKU_WORKSPACE: workspaceRoot,
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

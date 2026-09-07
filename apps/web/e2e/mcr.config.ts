import type { CoverageReportOptions } from "monocart-coverage-reports";

/** Monocart options for Playwright V8 coverage (Chromium only). */
const coverageOptions: CoverageReportOptions = {
  name: "Kampaku web e2e coverage",
  reports: ["console-summary", "v8", "lcovonly", "html"],
  outputDir: "./coverage/e2e",
  entryFilter: {
    "**/node_modules/**": false,
    "**/webpack-internal/**": false,
    "**/.next/**": true,
    "**/apps/web/src/**": true,
  },
  sourceFilter: {
    "**/node_modules/**": false,
    "**/apps/web/src/**": true,
    "**/src/**": true,
  },
};

export default coverageOptions;

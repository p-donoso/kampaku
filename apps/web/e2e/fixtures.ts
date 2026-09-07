import { test as base, expect, type Page } from "@playwright/test";
import MCR from "monocart-coverage-reports";
import coverageOptions from "./mcr.config";

/**
 * Extends Playwright test with optional Chromium V8 coverage collection.
 * Enable with E2E_COVERAGE=1 (see npm run test:e2e:coverage).
 */
const test = base.extend<{ autoCoverage: string }>({
  autoCoverage: [
    async ({ context }, use) => {
      const enabled = process.env.E2E_COVERAGE === "1";
      const isChromium = test.info().project.name === "chromium";

      const startCoverage = async (page: Page) => {
        await Promise.all([
          page.coverage.startJSCoverage({ resetOnNavigation: false }),
          page.coverage.startCSSCoverage({ resetOnNavigation: false }),
        ]);
      };

      if (enabled && isChromium) {
        context.on("page", startCoverage);
        for (const page of context.pages()) {
          await startCoverage(page);
        }
      }

      await use("autoCoverage");

      if (enabled && isChromium) {
        context.off("page", startCoverage);
        const coverageList = await Promise.all(
          context.pages().map(async (page) => {
            const [jsCoverage, cssCoverage] = await Promise.all([
              page.coverage.stopJSCoverage(),
              page.coverage.stopCSSCoverage(),
            ]);
            return [...jsCoverage, ...cssCoverage];
          }),
        );
        const mcr = MCR(coverageOptions);
        await mcr.add(coverageList.flat());
      }
    },
    { scope: "test", auto: true },
  ],
});

export { test, expect };

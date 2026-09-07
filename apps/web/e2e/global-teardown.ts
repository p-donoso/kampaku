import type { FullConfig } from "@playwright/test";
import MCR from "monocart-coverage-reports";
import coverageOptions from "./mcr.config";

export default async function globalTeardown(_config: FullConfig) {
  if (process.env.E2E_COVERAGE !== "1") return;
  const mcr = MCR(coverageOptions);
  await mcr.generate();
}

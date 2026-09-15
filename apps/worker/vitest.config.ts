import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", coverage: { provider: "v8", reporter: ["text", "json-summary", "lcov"], reportsDirectory: "./coverage", thresholds: { lines: 60, statements: 60, functions: 80, branches: 50 } } } });

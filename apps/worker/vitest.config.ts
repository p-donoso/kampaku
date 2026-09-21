import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", coverage: { provider: "v8", reporter: ["text", "json-summary", "lcov"], reportsDirectory: "./coverage", thresholds: { lines: 65, statements: 65, functions: 82, branches: 55 } } } });

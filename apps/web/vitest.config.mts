import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: { "@": path.join(packageRoot, "src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.join(packageRoot, "vitest.setup.ts")],
    restoreMocks: true,
    testTimeout: 15_000,
    exclude: ["**/node_modules/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/e2e/**",
        "**/tests/**",
      ],
      thresholds: {
        lines: 34,
        statements: 32,
        functions: 27,
        branches: 27,
      },
    },
  },
});

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
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/tests/**",
        "**/e2e/**",
      ],
      thresholds: {
        lines: 48,
        functions: 42,
        branches: 39,
        statements: 48,
      },
    },
  },
});

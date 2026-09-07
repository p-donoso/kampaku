import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/tests/**",
      ],
      thresholds: {
        lines: 70,
        functions: 85,
        branches: 55,
        statements: 68,
      },
    },
  },
});

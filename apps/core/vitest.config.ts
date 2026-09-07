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
        "**/eval/**",
      ],
      thresholds: {
        lines: 58,
        functions: 65,
        branches: 45,
        statements: 55,
      },
    },
  },
});

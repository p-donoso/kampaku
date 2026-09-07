import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx,js,mjs}"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/tests/**",
        "**/dist/**",
        "**/node_modules/**",
      ],
    },
  },
});

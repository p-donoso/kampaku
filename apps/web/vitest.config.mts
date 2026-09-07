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
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx,js,mjs}"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/e2e/**",
        "**/.next/**",
        "**/node_modules/**",
      ],
    },
  },
});

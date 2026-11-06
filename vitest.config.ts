import { defineConfig } from "vitest/config";

// Each workspace package with a vitest.config.ts is a test project.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
    coverage: {
      provider: "v8",
      // apps/web joins coverage with its test setup (#22).
      include: ["packages/*/src/**", "apps/extension/src/**"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
      // TEST §3: shared rules and the tracking engine must stay at >= 90 %.
      thresholds: {
        "packages/shared/src/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "apps/extension/src/engine/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});

import { defineConfig } from "vitest/config";

// Each workspace package with a vitest.config.ts is a test project.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**", "apps/web/{app,components,lib}/**"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
});

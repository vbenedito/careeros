import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Landing responsive layout (TEST-01, #142): real Chromium, no backend; runs in the CI checks
// job. Not part of `pnpm test` (it needs Playwright's Chromium). The app-page checks need the
// dashboard and live in tests/e2e.
export default defineConfig({
  // The landing renderer imports dashboard modules through the web app's `@/` alias.
  resolve: { alias: { "@": fileURLToPath(new URL("../web", import.meta.url)) } },
  test: {
    name: "responsive",
    environment: "node",
    include: ["tests/responsive/**/*.responsive.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

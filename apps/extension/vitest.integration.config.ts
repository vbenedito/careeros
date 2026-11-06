import { defineConfig } from "vitest/config";

// Real Chromium + built extension + local Supabase (see scripts/ci/integration.sh).
// Not part of `pnpm test`.
export default defineConfig({
  test: {
    name: "extension-integration",
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

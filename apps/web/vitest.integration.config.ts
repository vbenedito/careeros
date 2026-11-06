import { defineConfig } from "vitest/config";

// Integration tests need a running local Supabase stack and a running dashboard
// (see scripts/ci/integration.sh). They are not part of `pnpm test`.
export default defineConfig({
  test: {
    name: "web-integration",
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 30_000,
  },
});

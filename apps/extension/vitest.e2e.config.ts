import { defineConfig } from "vitest/config";

// E2E journeys (TEST §2): real Chromium, the built extension, the running dashboard and local
// Supabase (see scripts/ci/integration.sh). Not part of `pnpm test`.
export default defineConfig({
  test: {
    name: "e2e",
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    // One journey at a time: they share the dashboard server and the machine's focus.
    fileParallelism: false,
    // Polls wait on server round-trips and navigations (Vitest's default gives up after 1 s).
    expect: { poll: { timeout: 15_000, interval: 100 } },
  },
});

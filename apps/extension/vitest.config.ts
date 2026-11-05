import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "extension",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "*.test.ts"],
  },
});

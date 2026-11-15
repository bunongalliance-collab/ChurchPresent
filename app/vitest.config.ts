import { defineConfig } from "vitest/config";

// Unit tests only: the end-to-end tests in e2e/ run with Playwright (npm run e2e)
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});

import { defineConfig, devices } from "@playwright/test";

// End-to-end checks: each page opens, shows its heading, and logs no errors.
// Runs against the Vite dev server (started automatically). Run with: npm run e2e
export default defineConfig({
  testDir: "e2e",
  testIgnore: "offline/**",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});

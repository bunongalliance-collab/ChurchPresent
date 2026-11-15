import { defineConfig, devices } from "@playwright/test";

// Offline check: runs against the production build (the service worker only exists there).
// Run with: npm run e2e:offline
export default defineConfig({
  testDir: "e2e/offline",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 300000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});

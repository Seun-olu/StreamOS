import { defineConfig } from "@playwright/test";

const PORT = 3106;

/**
 * End-to-end journeys against a throwaway local PGlite database (a fresh
 * directory per run), using the locally installed Google Chrome.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", headless: true, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PGLITE_DIR: `.data/e2e-${Date.now()}` },
  },
});

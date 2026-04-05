import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.E2E_BASE_URL ?? "https://restaurant-order-system-blue.vercel.app";
const useWebServer = process.env.E2E_USE_WEB_SERVER === "true";
const sanitizedNodeOptions = (process.env.NODE_OPTIONS ?? "")
  .split(/\s+/)
  .filter(Boolean)
  .filter((option) => !option.startsWith("--inspect"))
  .join(" ");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: useWebServer
    ? {
        command: process.env.E2E_WEB_SERVER_COMMAND ?? "npm run dev --prefix ..",
        env: {
          ...process.env,
          NODE_OPTIONS: sanitizedNodeOptions
        },
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    // One live backend, shared rows: parallel workers would race each other.
    workers: 1,
    fullyParallel: false,
    timeout: 60_000,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://localhost:5173",
        trace: "retain-on-failure",
        screenshot: "on",
        video: "off",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 60_000,
    },
});

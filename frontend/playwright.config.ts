import { defineConfig } from "@playwright/test"


function e2ePort(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} debe ser un puerto TCP válido`)
  }
  return value
}

const backendPort = e2ePort("SIAD_E2E_BACKEND_PORT", 18_000)
const frontendPort = e2ePort("SIAD_E2E_FRONTEND_PORT", 15_173)


export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: [
    {
      command: `SIAD_E2E_BACKEND_PORT=${backendPort} SIAD_E2E_FRONTEND_PORT=${frontendPort} ./scripts/run-e2e-backend.sh`,
      cwd: "..",
      url: `http://127.0.0.1:${backendPort}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `SIAD_E2E_BACKEND_PORT=${backendPort} npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      cwd: ".",
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})

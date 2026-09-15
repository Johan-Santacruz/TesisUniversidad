// Auditoría de accesibilidad (axe-core) sobre el espacio de trabajo
// autenticado, que es lo que la auditoría pública de Lighthouse (Sección 4.3
// de la tesis) no cubre. Requiere el backend y el frontend corriendo
// localmente (`make backend`, `make frontend`) con la cuenta demo sembrada.
//
// Uso: node scripts/a11y-audit.mjs
import { chromium } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const FRONTEND_URL = process.env.SENDA_FRONTEND_URL ?? "http://localhost:5173"

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

await page.goto(`${FRONTEND_URL}/login`)
await page.getByRole("button", { name: /probar administrador de prueba/i }).click()
await page.getByRole("checkbox").check()
await page.getByRole("button", { name: /ingresar/i }).click()
await page.waitForURL("**/subir-video")
await page.waitForTimeout(1500)
await page.getByText(/ver primero el caso de demostraci/i).click()
await page.waitForTimeout(5000)

const results = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  .analyze()

console.log(JSON.stringify({
  url: page.url(),
  violationCount: results.violations.length,
  violations: results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
  })),
  passes: results.passes.length,
  incomplete: results.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })),
}, null, 2))

await browser.close()

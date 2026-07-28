import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page, type TestInfo } from "@playwright/test"


async function login(page: Page) {
  await page.goto("/subir-video")
  await expect(
    page.getByRole("heading", { name: "Ingresar a SIAD" }),
  ).toBeVisible()
  await page.getByLabel("Correo institucional").fill("admin@siad.local")
  await page.getByLabel("Contraseña").fill("Cambiar-Esta-Clave-2026!")
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page.getByRole("heading", { name: "Subir video" })).toBeVisible()
}


async function openFictitiousCase(page: Page) {
  await page.getByRole("button", {
    name: "Usar caso ficticio de demostración",
  }).click()
  await expect(
    page.getByRole("heading", { name: "Línea de tiempo" }),
  ).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("Recomendación preliminar")).toBeVisible()
}


const viewports = [
  { width: 360, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]

for (const viewport of viewports) {
  test(`el caso ficticio completa el workspace a ${viewport.width}px`, async ({
    page,
  }, testInfo: TestInfo) => {
    await page.setViewportSize(viewport)
    await login(page)
    await openFictitiousCase(page)

    const firstMoment = page.getByRole("button", {
      name: /salida de el tambo/i,
    })
    await firstMoment.focus()
    await page.keyboard.press("Enter")
    await expect(firstMoment).toHaveAttribute("aria-pressed", "true")

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(
      accessibility.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? "")),
    ).toEqual([])

    await testInfo.attach(`workspace-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  })
}


test("respeta movimiento reducido y mantiene la verificación operable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 360, height: 800 })
  await login(page)
  await openFictitiousCase(page)
  await page.getByRole("button", { name: "Abrir verificación" }).click()

  await expect(
    page.getByRole("heading", { name: "Verificación" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Cerrar verificación" }))
    .toBeVisible()
})


test("carga un video sintético y publica las ocho etapas aunque falten proveedores", async ({
  page,
}) => {
  await login(page)
  await page.getByLabel("Archivo de video ficticio").setInputFiles(
    "e2e/fixtures/tiny-fictitious.webm",
  )
  await page.getByRole("button", { name: "Analizar video ficticio" }).click()

  await expect(
    page.getByRole("heading", { name: "Construyendo la lectura del caso" }),
  ).toBeVisible()
  await expect(page.getByText("8 de 8 etapas persistidas")).toBeVisible({
    timeout: 20_000,
  })
})


test("un validador confirma hechos críticos y aprueba la orientación", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await login(page)
  await openFictitiousCase(page)

  const urgency = page.locator(".fact-card").filter({ hasText: "Urgencia" })
  await urgency.getByLabel("Lectura validada").fill("high")
  await urgency.getByLabel("Razón de la revisión").fill(
    "Validación humana del caso ficticio",
  )
  await urgency.getByRole("button", { name: "Confirmar lectura" }).click()

  const children = page.locator(".fact-card").filter({
    hasText: "Niñas, niños o adolescentes",
  })
  await children.getByLabel("Razón de la revisión").fill(
    "Validación humana del caso ficticio",
  )
  await children.getByRole("button", { name: "Confirmar lectura" }).click()

  const approve = page.getByRole("button", {
    name: "Aprobar orientación final",
  })
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(page.getByText("Orientación final aprobada")).toBeVisible()
})

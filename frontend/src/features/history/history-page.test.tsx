import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { AuthProvider } from "../../auth/auth-context"
import HistoryPage from "./history-page"


type CaseSummary = components["schemas"]["CaseSummaryRead"]
type CaseSummaryList = components["schemas"]["CaseSummaryList"]


function summary(overrides: Partial<CaseSummary> = {}): CaseSummary {
  return {
    id: "3f2a9c1b-0000-4000-8000-000000000001",
    reference: "3F2A9C1B",
    created_at: "2026-10-24T15:45:00Z",
    status: "in_review",
    recommendation_status: "preliminary",
    routes_status: "initial",
    approved_at: null,
    is_demo: false,
    video_status: "uploaded",
    category: "Desplazamiento",
    subcategory: "Desplazamiento forzado",
    signals_total: 4,
    critical_pending: 1,
    ...overrides,
  }
}

function page(items: CaseSummary[], total = items.length): CaseSummaryList {
  return { items, total }
}

// Responde según la ruta pedida; lo demás falla para que nada pase por
// accidente.
function serve(handler: (path: string) => unknown) {
  return vi.spyOn(apiClient, "request").mockImplementation(async (path: string) => {
    const value = handler(path)
    if (value instanceof Error) throw value
    return value as never
  })
}

function renderHistory() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/historial"]}>
        <Routes>
          <Route path="/historial" element={<HistoryPage />} />
          <Route path="/historial/:caseId" element={<p>Caso abierto</p>} />
          <Route path="/subir-video" element={<p>Pantalla de subida</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}


beforeEach(() => {
  vi.spyOn(apiClient, "refresh").mockResolvedValue({
    access_token: "token",
    token_type: "bearer",
    expires_in: 900,
    user: {
      id: "validador-1",
      email: "validador@senda.local",
      role: "validador",
      is_active: true,
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})


describe("HistoryPage", () => {
  it("lists each saved case with what identifies it and what is left to do", async () => {
    const request = serve(() =>
      page([
        summary(),
        summary({
          id: "case-approved",
          reference: "77AB12CD",
          status: "approved",
          recommendation_status: "final",
          critical_pending: 0,
          is_demo: true,
          video_status: "deleted",
          category: null,
        }),
      ]),
    )

    renderHistory()

    const entries = await screen.findAllByRole("listitem")
    expect(entries).toHaveLength(2)
    const [pending, approved] = entries
    expect(within(pending).getByText("Caso 3F2A9C1B")).toBeVisible()
    // El titular es la categoría, no la subcategoría sin calibrar.
    expect(within(pending).getByRole("heading", { name: "Desplazamiento" })).toBeVisible()
    expect(within(pending).getByText("4 señales · 1 crítica sin confirmar")).toBeVisible()
    expect(within(pending).getByText("En revisión")).toBeVisible()
    expect(within(pending).getByText(/24 de octubre de 2026/)).toBeVisible()
    expect(within(approved).getByText("Caso 77AB12CD · Demostración")).toBeVisible()
    expect(within(approved).getByRole("heading", { name: "Caso sin clasificar" })).toBeVisible()
    expect(
      within(approved).getByText(
        "4 señales · orientación aprobada · video eliminado por retención",
      ),
    ).toBeVisible()
    expect(within(approved).getByText("Aprobado")).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent("2 casos")
    expect(request).toHaveBeenCalledWith("/api/v1/cases?limit=20&offset=0")
  })

  it("opens a case from its entry", async () => {
    serve(() => page([summary()]))

    renderHistory()
    fireEvent.click(await screen.findByRole("link", { name: "Abrir el caso 3F2A9C1B" }))

    expect(await screen.findByText("Caso abierto")).toBeVisible()
  })

  it("filters by status on the server", async () => {
    const request = serve((path) =>
      path.includes("status=approved") ? page([]) : page([summary()]),
    )

    renderHistory()
    await screen.findByText("Caso 3F2A9C1B")
    fireEvent.click(screen.getByRole("button", { name: "Aprobados" }))

    expect(
      await screen.findByText("Ningún caso tiene todavía la orientación aprobada."),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Aprobados" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(request).toHaveBeenLastCalledWith(
      "/api/v1/cases?limit=20&offset=0&status=approved",
    )
  })

  it("discards a late answer from the filter it left behind", async () => {
    let answerAll: (value: CaseSummaryList) => void = () => undefined
    vi.spyOn(apiClient, "request").mockImplementation((path: string) => {
      if (path.includes("status=in_review")) {
        return Promise.resolve(page([summary({ id: "en-revision", reference: "REVISION" })])) as never
      }
      return new Promise((resolve) => {
        answerAll = resolve as never
      }) as never
    })

    renderHistory()
    fireEvent.click(await screen.findByRole("button", { name: "En revisión" }))
    await screen.findByText("Caso REVISION")
    answerAll(page([summary({ id: "viejo", reference: "VIEJO" })]))

    await waitFor(() => expect(screen.getByText("Caso REVISION")).toBeVisible())
    expect(screen.queryByText("Caso VIEJO")).not.toBeInTheDocument()
  })

  it("loads the next page without repeating what is already listed", async () => {
    const first = Array.from({ length: 20 }, (_, index) =>
      summary({ id: `case-${index}`, reference: `CASO${String(index).padStart(4, "0")}` }),
    )
    const request = serve((path) =>
      path.includes("offset=20")
        // El último de la primera página vuelve a llegar: entró un caso nuevo.
        ? page([first[19], summary({ id: "case-20", reference: "CASO0020" })], 21)
        : page(first, 21),
    )

    renderHistory()
    fireEvent.click(await screen.findByRole("button", { name: "Mostrar más casos" }))

    expect(await screen.findByText("Caso CASO0020")).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(21)
    expect(screen.queryByRole("button", { name: "Mostrar más casos" })).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledWith("/api/v1/cases?limit=20&offset=20")
  })

  it("invites to analyse a testimony when there are no cases yet", async () => {
    serve(() => page([]))

    renderHistory()

    expect(await screen.findByText("Todavía no hay casos guardados.")).toBeVisible()
    fireEvent.click(screen.getByRole("link", { name: /analizar un testimonio/i }))
    expect(await screen.findByText("Pantalla de subida")).toBeVisible()
  })

  it("says why the history did not load and lets you try again", async () => {
    let fail = true
    serve(() => (fail ? new Error("Sin conexión con el servidor") : page([summary()])))

    renderHistory()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No se pudo cargar el historial.")
    expect(alert).toHaveTextContent("Sin conexión con el servidor")
    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(await screen.findByText("Caso 3F2A9C1B")).toBeVisible()
  })

  it("downloads the PDF summary with the name the server proposes", async () => {
    serve(() => page([summary()]))
    const downloadFile = vi.spyOn(apiClient, "downloadFile").mockResolvedValue({
      blob: new Blob(["%PDF-"], { type: "application/pdf" }),
      filename: "senda-caso-3F2A9C1B.pdf",
    })
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:resumen")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("senda-caso-3F2A9C1B.pdf")
      expect(this.href).toBe("blob:resumen")
    })

    renderHistory()
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Descargar en PDF el resumen del caso 3F2A9C1B",
      }),
    )

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(downloadFile).toHaveBeenCalledWith(
      "/api/v1/cases/3f2a9c1b-0000-4000-8000-000000000001/report",
    )
  })

  it("explains a failed PDF next to its case", async () => {
    serve(() => page([summary()]))
    vi.spyOn(apiClient, "downloadFile").mockRejectedValue(new Error("Sin acceso a este caso"))

    renderHistory()
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Descargar en PDF el resumen del caso 3F2A9C1B",
      }),
    )

    const entry = screen.getByRole("listitem")
    expect(await within(entry).findByRole("alert")).toHaveTextContent("Sin acceso a este caso")
  })
})

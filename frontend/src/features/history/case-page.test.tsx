import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { AuthProvider } from "../../auth/auth-context"
import { TOUR_SEEN_KEY } from "../../components/analysis/analysis-workspace"
import { caseFixtureRevisado } from "../../test/case-fixture"
import CasePage from "./case-page"


type CaseData = components["schemas"]["CaseRead"]


function signIn(role: "operador" | "validador") {
  vi.spyOn(apiClient, "refresh").mockResolvedValue({
    access_token: "token",
    token_type: "bearer",
    expires_in: 900,
    user: { id: `${role}-1`, email: `${role}@senda.local`, role, is_active: true },
  })
}

function renderCase(path = "/historial/case-fixture") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/historial/:caseId" element={<CasePage />} />
          <Route path="/historial" element={<p>Lista del historial</p>} />
          <Route path="/subir-video" element={<p>Pantalla de subida</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}


beforeEach(() => {
  // El recorrido guiado se ofrece la primera vez y taparía la pantalla.
  window.localStorage.setItem(TOUR_SEEN_KEY, "visto")
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:testimonio")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})


describe("CasePage", () => {
  it("reopens a saved case in the same workspace, with its video from the server", async () => {
    signIn("operador")
    const request = vi.spyOn(apiClient, "request").mockResolvedValue(caseFixtureRevisado as never)
    const download = vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["video"]))

    renderCase()

    expect(await screen.findByRole("button", { name: "Escuchar" })).toHaveAttribute(
      "aria-current",
      "step",
    )
    expect(request).toHaveBeenCalledWith("/api/v1/cases/case-fixture")
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith("/api/v1/videos/video-fixture/stream"))
    expect(screen.getByRole("link", { name: /guardado en el historial/i })).toBeVisible()
    // En revisión todavía no hay PDF: sólo la nota de cuándo lo habrá.
    expect(screen.getByText("PDF disponible al aprobar la orientación")).toBeVisible()
  })

  it("sends 'analyse another testimony' to the upload screen", async () => {
    signIn("operador")
    vi.spyOn(apiClient, "request").mockResolvedValue(caseFixtureRevisado as never)
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["video"]))

    renderCase()
    fireEvent.click(await screen.findByRole("button", { name: "Ruta" }))
    fireEvent.click(await screen.findByRole("button", { name: /analizar otro testimonio/i }))

    expect(await screen.findByText("Pantalla de subida")).toBeVisible()
  })

  it("says so when the case no longer exists", async () => {
    signIn("operador")
    vi.spyOn(apiClient, "request").mockRejectedValue(new ApiError("Caso no encontrado", 404))

    renderCase("/historial/no-existe")

    expect(
      await screen.findByRole("heading", { name: "No encontramos este caso." }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole("link", { name: /volver al historial/i }))
    expect(await screen.findByText("Lista del historial")).toBeVisible()
  })

  it("does not chase a video that retention already deleted", async () => {
    signIn("validador")
    const deleted: CaseData = {
      ...caseFixtureRevisado,
      status: "approved",
      recommendation_status: "final",
      video_status: "deleted",
      memory_image: null,
    }
    const request = vi.spyOn(apiClient, "request").mockResolvedValue(deleted as never)
    const download = vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["video"]))

    renderCase()

    expect(
      await screen.findByText(/el video se eliminó al cumplirse el plazo de retención/i),
    ).toBeVisible()
    expect(download).not.toHaveBeenCalled()
    // Sin testimonio no hay cierre que generar: no se le pide al proveedor.
    expect(request).not.toHaveBeenCalledWith(
      expect.stringContaining("/memory-image/regenerate"),
      expect.anything(),
    )
  })
})

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixtureRevisado } from "../../test/case-fixture"
import { RouteStage } from "./route-stage"


/* Confirmadas las señales críticas, la ruta se reconstruye con ellas. La etapa
 * tiene que decir en qué punto de ese ajuste está el caso. */
describe("la ruta se ajusta con las señales confirmadas", () => {
  it("no muestra la ruta anterior mientras se reconstruye", () => {
    render(
      <RouteStage
        caseData={{ ...caseFixtureRevisado, routes_status: "rebuilding" }}
        role="validador"
        onApprove={vi.fn()}
      />,
    )

    expect(
      screen.getByText("Ajustando la ruta con las señales confirmadas…"),
    ).toBeInTheDocument()
    expect(screen.queryAllByText("Atención inmediata")).toHaveLength(0)
  })

  it("marca la ruta construida con las señales confirmadas", () => {
    render(
      <RouteStage
        caseData={{ ...caseFixtureRevisado, routes_status: "rebuilt" }}
        role="validador"
        onApprove={vi.fn()}
      />,
    )

    expect(
      screen.getByText("Construida con las señales confirmadas"),
    ).toBeInTheDocument()
  })

  it("si el ajuste falla, conserva las rutas iniciales y deja reintentar", async () => {
    const onRetryRebuild = vi.fn()
    render(
      <RouteStage
        caseData={{ ...caseFixtureRevisado, routes_status: "rebuild_failed" }}
        role="validador"
        onApprove={vi.fn()}
        onRetryRebuild={onRetryRebuild}
      />,
    )

    expect(
      screen.getByText("No se pudo ajustar la ruta con las señales confirmadas"),
    ).toBeInTheDocument()
    expect(screen.getAllByText("Atención inmediata").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Aprobar orientación final" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))

    await waitFor(() => expect(onRetryRebuild).toHaveBeenCalledOnce())
  })
})

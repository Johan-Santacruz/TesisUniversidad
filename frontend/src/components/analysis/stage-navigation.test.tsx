import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { caseFixtureRevisado } from "../../test/case-fixture"
import { AnalysisWorkspace, TOUR_SEEN_KEY } from "./analysis-workspace"


const stageTab = (name: "Escuchar" | "Señales" | "Ruta") =>
  screen.getByRole("button", { name })

function expectStage(name: "Escuchar" | "Señales" | "Ruta") {
  expect(stageTab(name)).toHaveAttribute("aria-current", "step")
}

function goBackInBrowser() {
  act(() => {
    window.history.back()
  })
}


beforeEach(() => {
  // El recorrido guiado se ofrece la primera vez y cambiaría de etapa solo.
  window.localStorage.setItem(TOUR_SEEN_KEY, "visto")
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})


describe("moving between stages", () => {
  it("goes forward and back from the pager at the foot of the sheet", () => {
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)

    // En la primera etapa no hay adónde volver.
    expect(screen.queryByRole("button", { name: /^volver a/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /revisar señales/i }))
    expectStage("Señales")

    fireEvent.click(screen.getByRole("button", { name: "Volver a Escuchar" }))
    expectStage("Escuchar")

    fireEvent.click(screen.getByRole("button", { name: /revisar señales/i }))
    fireEvent.click(screen.getByRole("button", { name: /continuar a la ruta/i }))
    expectStage("Ruta")
    expect(screen.getByRole("button", { name: "Volver a Señales" })).toBeVisible()
    expect(screen.getByRole("button", { name: /analizar otro testimonio/i })).toBeVisible()
  })

  it("offers the way back to the history before the first stage", () => {
    const backToHistory = vi.fn()
    render(
      <AnalysisWorkspace
        initialCase={caseFixtureRevisado}
        role="operador"
        backAction={{ label: "Historial", onClick: backToHistory }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Volver al historial" }))

    expect(backToHistory).toHaveBeenCalledTimes(1)
  })

  it("lets the browser's back step return to the previous stage", async () => {
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)

    fireEvent.click(stageTab("Señales"))
    fireEvent.click(stageTab("Ruta"))
    expectStage("Ruta")

    goBackInBrowser()
    await waitFor(() => expectStage("Señales"))
    goBackInBrowser()
    await waitFor(() => expectStage("Escuchar"))
  })

  it("picks the case up again at the stage it was left on", () => {
    const { unmount } = render(
      <AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />,
    )
    fireEvent.click(stageTab("Ruta"))
    unmount()

    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)

    expectStage("Ruta")
  })

  it("unstacks the stages of a case it leaves behind on the same screen", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined)
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)
    fireEvent.click(stageTab("Señales"))
    fireEvent.click(stageTab("Ruta"))

    fireEvent.click(screen.getByRole("button", { name: /analizar otro testimonio/i }))

    expect(go).toHaveBeenCalledWith(-2)
  })

  it("brings a stacked layout to the start of the new stage", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(max-width: 1000px)" || query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }))
    const scrolled: Element[] = []
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      scrolled.push(this)
    })
    render(<AnalysisWorkspace initialCase={caseFixtureRevisado} role="operador" />)
    scrolled.length = 0

    fireEvent.click(screen.getByRole("button", { name: /revisar señales/i }))

    // Espera a que la etapa nueva esté en la página: medido antes, el salto
    // se quedaba corto.
    await waitFor(() =>
      expect(scrolled.some((element) => element.classList.contains("narrative-sheet"))).toBe(true))
  })
})

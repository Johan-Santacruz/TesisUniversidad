import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import {
  AnalysisWorkspace,
  TOUR_DELAY_MS,
  TOUR_SEEN_KEY,
} from "./analysis-workspace"
import { GuidedTour, WORKSPACE_TOUR, type TourStep } from "./guided-tour"


const STEPS: TourStep[] = [
  { eyebrow: "Uno", title: "Primer paso", body: "Cuerpo uno", target: "#blanco" },
  { eyebrow: "Dos", title: "Segundo paso", body: "Cuerpo dos", target: "#blanco" },
  { eyebrow: "Tres", title: "Tercer paso", body: "Cuerpo tres" },
]


function renderTour(onClose = vi.fn()) {
  const result = render(
    <>
      <button id="blanco" type="button">Elemento señalado</button>
      <GuidedTour steps={STEPS} open onClose={onClose} />
    </>,
  )
  return { ...result, onClose }
}


// La ficha se releva con mode="wait": la anterior sale antes de que entre la
// siguiente, así que el paso nuevo llega un instante después del clic.
it("abre en el primer paso y avanza y retrocede", async () => {
  renderTour()

  expect(screen.getByRole("heading", { name: "Primer paso" })).toBeVisible()

  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
  expect(await screen.findByRole("heading", { name: "Segundo paso" })).toBeVisible()

  fireEvent.click(screen.getByRole("button", { name: "Atrás" }))
  expect(await screen.findByRole("heading", { name: "Primer paso" })).toBeVisible()
})


it("no ofrece Atrás en el primer paso", () => {
  renderTour()

  expect(screen.queryByRole("button", { name: "Atrás" })).toBeNull()
})


it("el último paso cierra en vez de seguir avanzando", async () => {
  const { onClose } = renderTour()

  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
  fireEvent.click(await screen.findByRole("button", { name: "Siguiente" }))

  expect(await screen.findByRole("heading", { name: "Tercer paso" })).toBeVisible()
  expect(screen.queryByRole("button", { name: "Siguiente" })).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "Empezar" }))
  expect(onClose).toHaveBeenCalled()
})


it("se sale con Escape y se navega con las flechas", async () => {
  const { onClose } = renderTour()
  const layer = screen.getByTestId("guided-tour")

  fireEvent.keyDown(layer, { key: "ArrowRight" })
  expect(await screen.findByRole("heading", { name: "Segundo paso" })).toBeVisible()

  fireEvent.keyDown(layer, { key: "ArrowLeft" })
  expect(await screen.findByRole("heading", { name: "Primer paso" })).toBeVisible()

  fireEvent.keyDown(layer, { key: "Escape" })
  expect(onClose).toHaveBeenCalled()
})


it("devuelve el foco a donde estaba al terminar", () => {
  const onClose = vi.fn()
  render(
    <>
      <button id="blanco" type="button">Elemento señalado</button>
      <button type="button">Quien lo abrió</button>
    </>,
  )
  const opener = screen.getByRole("button", { name: "Quien lo abrió" })
  opener.focus()

  render(<GuidedTour steps={STEPS} open onClose={onClose} />)
  // El foco se lleva a la ficha para que el teclado empiece dentro del velo.
  expect(document.activeElement).not.toBe(opener)

  fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
  expect(document.activeElement).toBe(opener)
})


it("el paso sin elemento señalado se muestra centrado y sin foco", async () => {
  const { container } = renderTour()

  expect(container.ownerDocument.querySelector(".tour-spotlight")).not.toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }))
  fireEvent.click(await screen.findByRole("button", { name: "Siguiente" }))
  await screen.findByRole("heading", { name: "Tercer paso" })

  const document_ = container.ownerDocument
  expect(document_.querySelector(".tour-spotlight")).toBeNull()
  expect(document_.querySelector(".tour-card--centered")).not.toBeNull()
})


it("no se muestra cuando está cerrado", () => {
  render(<GuidedTour steps={STEPS} open={false} onClose={vi.fn()} />)

  expect(screen.queryByTestId("guided-tour")).toBeNull()
})


describe("El recorrido del pliego de análisis", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function abrirCaso() {
    return render(<AnalysisWorkspace initialCase={caseFixture} role="admin" />)
  }

  it("cada paso abre su etapa e ilumina un elemento que existe de verdad", async () => {
    // Un selector mal escrito no rompe nada visible: el paso deja de iluminar
    // y el recorrido sigue como si tal cosa. Aquí se recorre entero contra el
    // DOM real, etapa por etapa.
    abrirCaso()
    fireEvent.click(screen.getByRole("button", { name: "Ver cómo funciona" }))

    for (const [position, step] of WORKSPACE_TOUR.entries()) {
      await screen.findByRole("heading", { name: step.title })

      if (step.target) {
        const selector = step.target
        await waitFor(() =>
          expect(document.querySelector(selector)).not.toBeNull(),
        )
      }

      if (position < WORKSPACE_TOUR.length - 1) {
        fireEvent.click(
          await screen.findByRole("button", { name: "Siguiente" }),
        )
      }
    }

    fireEvent.click(screen.getByRole("button", { name: "Empezar" }))
    expect(screen.queryByTestId("guided-tour")).toBeNull()
  })

  it("cambiar de paso cambia la etapa del pliego", async () => {
    abrirCaso()
    fireEvent.click(screen.getByRole("button", { name: "Ver cómo funciona" }))
    await screen.findByRole("heading", { name: WORKSPACE_TOUR[0].title })

    expect(screen.getByRole("button", { name: "Escuchar" }))
      .toHaveAttribute("aria-current", "step")

    // Cuarto paso: la revisión de señales vive en la segunda hoja del pliego.
    for (let salto = 0; salto < 3; salto += 1) {
      fireEvent.click(await screen.findByRole("button", { name: "Siguiente" }))
    }
    await screen.findByRole("heading", { name: WORKSPACE_TOUR[3].title })

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Señales" }))
        .toHaveAttribute("aria-current", "step"),
    )
  })

  it("se ofrece solo la primera vez, y el atajo lo devuelve", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const primera = abrirCaso()
    await act(async () => {
      vi.advanceTimersByTime(TOUR_DELAY_MS)
    })
    expect(screen.getByTestId("guided-tour")).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Saltar" }))
    expect(screen.queryByTestId("guided-tour")).toBeNull()
    expect(localStorage.getItem(TOUR_SEEN_KEY)).toBe("visto")
    primera.unmount()

    // Segunda visita: quien ya lo vio no debería tener que saltarlo cada vez.
    abrirCaso()
    await act(async () => {
      vi.advanceTimersByTime(TOUR_DELAY_MS * 3)
    })
    expect(screen.queryByTestId("guided-tour")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Ver cómo funciona" }))
    expect(screen.getByTestId("guided-tour")).toBeVisible()
  })
})

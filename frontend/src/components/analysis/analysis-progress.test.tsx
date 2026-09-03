import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisProgress } from "./analysis-progress"

const motionTestState = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("framer-motion", async () => {
  const React = await import("react")

  function motionElement(tag: string) {
    return function MotionElement({
      children,
      transition,
      variants: _variants,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      ...props
    }: {
      children?: React.ReactNode
      transition?: unknown
      [key: string]: unknown
    }) {
      const duration = tag === "li"
        && transition
        && typeof transition === "object"
        && "duration" in transition
          ? String(transition.duration)
          : undefined

      const delay = transition
        && typeof transition === "object"
        && "delay" in transition
          ? String(transition.delay)
          : undefined

      return React.createElement(
        tag,
        { ...props, "data-motion-duration": duration, "data-motion-delay": delay },
        children,
      )
    }
  }

  // La vista de resultados en vivo usa muchas más etiquetas que los capítulos
  // (div, section, article, dl, small…). Se sirven bajo demanda para no tener
  // que ampliar el mock cada vez que una entra en escena.
  const elements = new Map<string, unknown>()
  const motion = new Proxy({} as Record<string, unknown>, {
    get(_target, property) {
      if (typeof property !== "string") return undefined
      if (!elements.has(property)) elements.set(property, motionElement(property))
      return elements.get(property)
    },
  })

  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => motionTestState.reduceMotion,
  }
})

describe("AnalysisProgress", () => {
  beforeEach(() => {
    motionTestState.reduceMotion = false
  })

  it("expone el avance real de etapas logradas", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "completed", payload: {} },
          { id: 2, stage: "transcription", state: "completed", payload: {} },
        ]}
      />,
    )

    const meter = screen.getByRole("progressbar")
    expect(meter).toHaveAttribute("aria-valuenow", "2")
    expect(meter).toHaveAttribute("aria-valuetext", "2 de 8 etapas listas")
  })

  // El fallo que motivó el rediseño: se contaban eventos recibidos, así que una
  // etapa caída empujaba la barra igual que una lograda.
  it("no cuenta como avance una etapa fallida o no disponible", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "completed", payload: {} },
          { id: 2, stage: "transcription", state: "failed", payload: {} },
          { id: 3, stage: "people_places", state: "unavailable", payload: {} },
        ]}
      />,
    )

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
    expect(screen.getByText("2 etapas quedaron sin resultado")).toBeVisible()
  })

  it("muestra los estados fallidos a quien mira la pantalla", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "failed", payload: {} },
          { id: 2, stage: "transcription", state: "unavailable", payload: {} },
        ]}
      />,
    )
    const audio = screen.getByText("Audio").closest("li")
    const transcription = screen.getByText("Transcripción").closest("li")

    expect(audio).toHaveClass("state-failed")
    expect(audio).not.toHaveClass("is-settled")
    expect(within(audio as HTMLElement).getByText("Con error")).toBeVisible()
    expect(transcription).toHaveClass("state-unavailable")
    expect(
      within(transcription as HTMLElement).getByText("No disponible"),
    ).toBeVisible()
  })

  it("ofrece reintentar cuando el flujo se cae", () => {
    const onRetry = vi.fn()
    render(
      <AnalysisProgress
        error="Se interrumpió el análisis"
        events={[]}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("no ofrece reintentar mientras el análisis avanza", () => {
    render(<AnalysisProgress error="" events={[]} onRetry={vi.fn()} />)

    expect(
      screen.queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument()
  })

  it("anima la entrada de los capítulos en 520ms", () => {
    render(<AnalysisProgress error="" events={[]} />)

    expect(screen.getByText("Escuchando").closest("li")).toHaveAttribute(
      "data-motion-duration",
      "0.52",
    )
  })

  it("acorta la entrada cuando se pide reducir movimiento", () => {
    motionTestState.reduceMotion = true
    render(<AnalysisProgress error="" events={[]} />)

    expect(screen.getByText("Escuchando").closest("li")).toHaveAttribute(
      "data-motion-duration",
      "0.01",
    )
  })

  /* Lo que se veía plano: los fragmentos llegan por lotes y entraban todos a
     la vez, con la misma animación CSS y sin retardo. */
  it("hace entrar los fragmentos escalonados dentro de su lote", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 2,
            stage: "transcription",
            state: "completed",
            payload: {
              segments: [
                {
                  id: "segmento-1",
                  start_ms: 4000,
                  end_ms: 7800,
                  text: "Fragmento 1 del testimonio.",
                },
                {
                  id: "segmento-2",
                  start_ms: 8000,
                  end_ms: 11800,
                  text: "Fragmento 2 del testimonio.",
                },
                {
                  id: "segmento-3",
                  start_ms: 12000,
                  end_ms: 15800,
                  text: "Fragmento 3 del testimonio.",
                },
              ],
            },
          },
        ]}
      />,
    )

    const delays = ["Fragmento 1", "Fragmento 2", "Fragmento 3"].map((text) =>
      screen
        .getByText(`${text} del testimonio.`)
        .closest("li")
        ?.getAttribute("data-motion-delay"),
    )

    expect(delays).toEqual(["0", "0.085", "0.17"])
  })

  // Y el lote siguiente vuelve a empezar en cero: si el retardo se contara
  // sobre el índice absoluto, el fragmento 40 esperaría más de tres segundos.
  it("reinicia la cascada en cada lote nuevo", () => {
    const { rerender } = render(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 2,
            stage: "transcription",
            state: "completed",
            payload: {
              segments: [
                {
                  id: "segmento-1",
                  start_ms: 4000,
                  end_ms: 7800,
                  text: "Fragmento 1 del testimonio.",
                },
                {
                  id: "segmento-2",
                  start_ms: 8000,
                  end_ms: 11800,
                  text: "Fragmento 2 del testimonio.",
                },
              ],
            },
          },
        ]}
      />,
    )

    rerender(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 2,
            stage: "transcription",
            state: "completed",
            payload: {
              segments: [
                {
                  id: "segmento-1",
                  start_ms: 4000,
                  end_ms: 7800,
                  text: "Fragmento 1 del testimonio.",
                },
                {
                  id: "segmento-2",
                  start_ms: 8000,
                  end_ms: 11800,
                  text: "Fragmento 2 del testimonio.",
                },
                {
                  id: "segmento-3",
                  start_ms: 12000,
                  end_ms: 15800,
                  text: "Fragmento 3 del testimonio.",
                },
              ],
            },
          },
        ]}
      />,
    )

    expect(
      screen
        .getByText("Fragmento 3 del testimonio.")
        .closest("li")
        ?.getAttribute("data-motion-delay"),
    ).toBe("0")
  })

  it("no escalona nada cuando se pide reducir movimiento", () => {
    motionTestState.reduceMotion = true
    render(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 2,
            stage: "transcription",
            state: "completed",
            payload: {
              segments: [
                {
                  id: "segmento-1",
                  start_ms: 4000,
                  end_ms: 7800,
                  text: "Fragmento 1 del testimonio.",
                },
                {
                  id: "segmento-2",
                  start_ms: 8000,
                  end_ms: 11800,
                  text: "Fragmento 2 del testimonio.",
                },
                {
                  id: "segmento-3",
                  start_ms: 12000,
                  end_ms: 15800,
                  text: "Fragmento 3 del testimonio.",
                },
              ],
            },
          },
        ]}
      />,
    )

    expect(
      screen
        .getByText("Fragmento 3 del testimonio.")
        .closest("li")
        ?.getAttribute("data-motion-delay"),
    ).toBe("0")
  })

  it("revela la transcripción antes de que terminen las rutas", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "completed", payload: {} },
          {
            id: 2,
            stage: "transcription",
            state: "completed",
            payload: {
              segments: [
                {
                  id: "segment-live-1",
                  start_ms: 0,
                  end_ms: 4200,
                  text: "La familia llegó a Popayán buscando un lugar seguro.",
                },
              ],
            },
          },
        ]}
      />,
    )

    expect(
      screen.getByRole("navigation", { name: "Resultados del análisis en curso" }),
    ).toBeVisible()
    expect(
      screen.getByText("La familia llegó a Popayán buscando un lugar seguro."),
    ).toBeVisible()
    expect(screen.getByText("Resultado parcial")).toBeVisible()
  })

  it("incorpora las señales a la misma vista mientras el análisis avanza", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 3,
            stage: "people_places",
            state: "completed",
            payload: {
              facts: [
                {
                  id: "fact-live-place",
                  label: "Lugar de llegada",
                  value: "Popayán",
                  display_value: "Popayán",
                  is_critical: false,
                  origin: "agreed",
                  confidence_band: "high",
                  verification_status: "confirmed",
                },
              ],
            },
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /señales/i }))

    expect(screen.getByText("Lugar de llegada")).toBeVisible()
    expect(screen.getByText("Popayán")).toBeVisible()
  })

  it("incorpora las rutas sin abandonar la ventana de resultados", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          {
            id: 8,
            stage: "routes",
            state: "completed",
            payload: {
              routes: [
                {
                  id: "route-live-emergency",
                  route_type: "emergency",
                  title: "Atención inmediata",
                  summary: "Protección y alojamiento para las primeras horas.",
                  steps: [{ title: "Contactar" }, { title: "Solicitar alojamiento" }],
                },
              ],
            },
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /ruta/i }))

    expect(screen.getByText("Atención inmediata")).toBeVisible()
    expect(screen.getByText("2 pasos listos")).toBeVisible()
  })
})

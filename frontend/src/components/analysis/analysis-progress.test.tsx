import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisProgress } from "./analysis-progress"

const motionTestState = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("framer-motion", async () => {
  const React = await import("react")

  function motionElement(tag: "li" | "ol" | "strong" | "span") {
    return function MotionElement({
      children,
      transition,
      variants: _variants,
      initial: _initial,
      animate: _animate,
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

      return React.createElement(
        tag,
        { ...props, "data-motion-duration": duration },
        children,
      )
    }
  }

  return {
    motion: {
      li: motionElement("li"),
      ol: motionElement("ol"),
      strong: motionElement("strong"),
      span: motionElement("span"),
    },
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
})

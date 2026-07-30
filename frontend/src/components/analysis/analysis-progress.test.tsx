import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisProgress } from "./analysis-progress"

const motionTestState = vi.hoisted(() => ({ reduceMotion: false }))

vi.mock("framer-motion", async () => {
  const React = await import("react")

  function motionElement(tag: "li" | "ol" | "strong") {
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
    },
    useReducedMotion: () => motionTestState.reduceMotion,
  }
})

describe("AnalysisProgress", () => {
  beforeEach(() => {
    motionTestState.reduceMotion = false
  })

  it("exposes real persisted progress", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "completed", payload: {} },
          { id: 2, stage: "transcription", state: "completed", payload: {} },
        ]}
      />,
    )

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2")
    expect(screen.getByText("25%")).toBeVisible()
    expect(screen.getByText("2 de 8 etapas persistidas")).toBeVisible()
  })

  it("distinguishes persisted failures from successful completion", () => {
    render(
      <AnalysisProgress
        error=""
        events={[
          { id: 1, stage: "audio", state: "failed", payload: {} },
        ]}
      />,
    )
    const audioStage = screen.getByText("Audio").closest("li")

    expect(audioStage).not.toBeNull()
    expect(audioStage).toHaveTextContent("Persistida, con error")
    expect(audioStage).toHaveClass("state-failed")
    expect(audioStage).not.toHaveClass("is-complete")
    expect(within(audioStage as HTMLElement).getByText("Persistida")).toBeVisible()
  })

  it("animates chapter entrances over 520ms", () => {
    render(<AnalysisProgress error="" events={[]} />)

    expect(screen.getByText("Escuchando").closest("li")).toHaveAttribute(
      "data-motion-duration",
      "0.52",
    )
  })

  it("reduces chapter entrance duration when requested", () => {
    motionTestState.reduceMotion = true
    render(<AnalysisProgress error="" events={[]} />)

    expect(screen.getByText("Escuchando").closest("li")).toHaveAttribute(
      "data-motion-duration",
      "0.01",
    )
  })
})

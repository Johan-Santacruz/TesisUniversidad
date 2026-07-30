import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AnalysisProgress } from "./analysis-progress"

describe("AnalysisProgress", () => {
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
})

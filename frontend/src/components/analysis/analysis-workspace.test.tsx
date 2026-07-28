import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { AnalysisWorkspace } from "./analysis-workspace"
import { VerificationPanel } from "./verification-panel"
import { UploadPanel } from "./upload-panel"


describe("AnalysisWorkspace", () => {
  it("seeks the video to the selected timeline event", () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement

    fireEvent.click(
      screen.getByRole("button", {
        name: /desplazamiento hacia popayán/i,
      }),
    )

    expect(video.currentTime).toBe(18.4)
    expect(screen.getByText("La familia llegó a Popayán y necesita alojamiento seguro."))
      .toHaveAttribute("data-active", "true")
  })

  it("groups facts with visible verification labels", () => {
    render(
      <VerificationPanel
        facts={caseFixture.facts}
        role="operador"
        onReview={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "Alta confianza" })).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "Requiere confirmación" }),
    ).toBeVisible()
    expect(
      screen.getByRole("heading", { name: "No identificado" }),
    ).toBeVisible()
  })

  it("keeps real testimonies locked and exposes the fictitious demo", () => {
    const onDemo = vi.fn()
    render(
      <UploadPanel busy={false} onUpload={vi.fn()} onDemo={onDemo} />,
    )

    expect(screen.getByText("Testimonios reales bloqueados")).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", {
        name: /usar caso ficticio de demostración/i,
      }),
    )
    expect(onDemo).toHaveBeenCalledOnce()
  })
})

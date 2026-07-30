import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { AnalysisWorkspace } from "./analysis-workspace"
import { narrativeStageTransition } from "./motion"
import { VerificationPanel } from "./verification-panel"
import { UploadPanel } from "./upload-panel"
import { DocumentaryVideoRail } from "./video-panel"


describe("AnalysisWorkspace", () => {
  it.each([
    { reduceMotion: false, duration: 0.22, mode: "normal" },
    { reduceMotion: true, duration: 0.01, mode: "reduced" },
  ])("uses a $duration second $mode stage phase", ({
    reduceMotion,
    duration,
  }) => {
    expect(narrativeStageTransition(reduceMotion).duration).toBe(duration)
  })

  it("seeks the video to the selected timeline event", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement

    expect(
      screen.getByRole("button", { name: "Escuchar" }),
    ).toHaveAttribute("aria-current", "step")
    expect(
      screen.getByRole("button", { name: "Señales" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Ruta" }),
    ).toBeVisible()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Ruta",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: /desplazamiento hacia popayán/i,
      }),
    )

    expect(video.currentTime).toBe(18.4)
    expect(
      screen.getByRole("button", {
        name: /0:18la familia llegó a popayán/i,
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("marks the selected transcript fragment as the current context", () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const activeFragment = screen.getByRole("button", {
      name: /0:00.*la familia ficticia salió de el tambo/i,
    })

    fireEvent.click(activeFragment)

    expect(activeFragment).toHaveAttribute("aria-current", "true")
  })

  it("marks the active documentary rail fragment as current", () => {
    render(
      <DocumentaryVideoRail
        source={null}
        segments={caseFixture.segments}
        activeSegmentId="segment-1"
        onSegmentSelect={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: /0:00.*la familia ficticia salió de el tambo/i,
      }),
    ).toHaveAttribute("aria-current", "true")
    expect(
      screen.getByRole("button", {
        name: /0:18.*la familia llegó a popayán/i,
      }),
    ).not.toHaveAttribute("aria-current")
  })

  it("shows each signal with its verification state and review action", () => {
    render(
      <VerificationPanel
        facts={caseFixture.facts}
        role="operador"
        onReview={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "Señales encontradas" })).toBeVisible()
    expect(screen.getByText("Confirmado")).toBeVisible()
    expect(screen.getByText("Inconsistente")).toBeVisible()
    expect(screen.getByText("No identificado")).toBeVisible()
    expect(
      screen.getAllByRole("button", { name: /necesito corregirlo/i }),
    ).toHaveLength(2)
  })

  it("collects a value when a validator confirms an unresolved signal", () => {
    const onReview = vi.fn()
    render(
      <VerificationPanel
        facts={caseFixture.facts}
        role="validador"
        onReview={onReview}
      />,
    )
    const urgency = screen.getByText("Urgencia").closest("article")
    expect(urgency).not.toBeNull()

    fireEvent.click(
      within(urgency as HTMLElement).getByRole("button", {
        name: /esto es correcto/i,
      }),
    )
    fireEvent.change(
      within(urgency as HTMLElement).getByLabelText("Valor confirmado"),
      { target: { value: "high" } },
    )
    fireEvent.change(
      within(urgency as HTMLElement).getByLabelText(
        "Razón de la confirmación",
      ),
      { target: { value: "Validación humana del caso ficticio" } },
    )
    fireEvent.click(
      within(urgency as HTMLElement).getByRole("button", {
        name: "Confirmar lectura",
      }),
    )

    expect(onReview).toHaveBeenCalledWith("fact-urgency", {
      action: "confirm",
      value: "high",
      reason: "Validación humana del caso ficticio",
    })
  })

  it("keeps real testimonies locked and exposes the fictitious demo", () => {
    const onDemo = vi.fn()
    render(
      <UploadPanel busy={false} onUpload={vi.fn()} onDemo={onDemo} />,
    )

    expect(screen.getByText("Testimonios reales bloqueados")).toBeVisible()
    expect(
      screen.getByTestId("soft-editorial-upload"),
    ).toHaveAttribute("data-visual-state", "ready")
    expect(
      screen.getByRole("button", { name: "Elegir archivo" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Probar caso de demostración" }),
    ).toHaveClass("demo-link")
    fireEvent.click(
      screen.getByRole("button", {
        name: "Probar caso de demostración",
      }),
    )
    expect(onDemo).toHaveBeenCalledOnce()
  })
})

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { components } from "../../api/generated"
import { memoryImageFixture } from "../../test/case-fixture"
import { MemoryImagePanel } from "./memory-image-panel"


type MemoryImage = components["schemas"]["MemoryImageRead"]

const DISCLOSURE =
  "Imagen representativa generada a partir del contexto documentado del caso. "
  + "No corresponde a un registro de los hechos."
const ALT_TEXT = "Imagen representativa del cierre de memoria del caso"

function panel(
  memoryImage: MemoryImage | null,
  overrides: Partial<Parameters<typeof MemoryImagePanel>[0]> = {},
) {
  const props = {
    memoryImage,
    role: "validador" as const,
    imageSource: "blob:memory-image",
    videoMode: "original" as const,
    onRegenerate: vi.fn(),
    onDecision: vi.fn(),
    onRetryRender: vi.fn(),
    onVideoModeChange: vi.fn(),
    ...overrides,
  }
  render(<MemoryImagePanel {...props} />)
  return props
}


describe("MemoryImagePanel", () => {
  it("offers the three review actions on a pending image with its disclosure", () => {
    panel({ ...memoryImageFixture, status: "pending_review" })

    const image = screen.getByRole("img", { name: ALT_TEXT })
    expect(image).toHaveAttribute("src", "blob:memory-image")
    // La advertencia vive fuera de la imagen: no se pierde si la imagen falla.
    expect(image.closest("figure")).toHaveTextContent(DISCLOSURE)
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Generar otra" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Descartar" })).toBeEnabled()
  })

  it("shows an operator the image and disclosure without any mutation control", () => {
    panel(
      { ...memoryImageFixture, status: "pending_review" },
      { role: "operador" },
    )

    expect(screen.getByRole("img", { name: ALT_TEXT })).toBeVisible()
    // La leyenda vive en la ficha y en la lámina; con `aria-modal` el lector
    // sólo anuncia la de la lámina, así que ambas son correctas.
    expect(screen.getAllByText(DISCLOSURE).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Generar otra" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull()
    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("La imagen está pendiente de revisión.")
  })

  it("lets an administrator decide as well", () => {
    const props = panel(
      { ...memoryImageFixture, status: "pending_review" },
      { role: "admin" },
    )

    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))

    expect(props.onDecision).toHaveBeenCalledWith("approve")
  })

  it("reports a generation failure with a fixed message and a new attempt", () => {
    const props = panel({
      ...memoryImageFixture,
      status: "failed",
      image_url: null,
      failure_code: "provider_error",
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "No fue posible generar la imagen de cierre. "
      + "El caso continúa sin cierre visual y se puede intentar otra generación.",
    )
    expect(screen.queryByRole("img", { name: ALT_TEXT })).toBeNull()
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Generar otra" }))

    expect(props.onRegenerate).toHaveBeenCalledTimes(1)
  })

  it("states that a rejected case continues without a closing image", () => {
    panel({ ...memoryImageFixture, status: "rejected", image_url: null })

    expect(screen.getByRole("status")).toHaveTextContent(
      "La imagen fue descartada. El caso continúa sin cierre visual.",
    )
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull()
  })

  it("announces that the closing version is being prepared", () => {
    panel({
      ...memoryImageFixture,
      status: "approved",
      render_status: "rendering",
      rendered_video_url: null,
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparando versión con cierre…",
    )
    expect(
      screen.queryByRole("button", { name: "Versión con cierre de memoria" }),
    ).toBeNull()
    expect(screen.queryByRole("button", { name: "Reintentar cierre" })).toBeNull()
  })

  it("keeps the approval and offers a retry when the render fails", () => {
    const props = panel({
      ...memoryImageFixture,
      status: "approved",
      render_status: "failed",
      rendered_video_url: null,
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "No fue posible preparar la versión con cierre. "
      + "El testimonio original permanece intacto y el cierre se puede reintentar.",
    )

    fireEvent.click(screen.getByRole("button", { name: "Reintentar cierre" }))

    expect(props.onRetryRender).toHaveBeenCalledTimes(1)
  })

  it("hides the retry from an operator whose render failed", () => {
    panel(
      {
        ...memoryImageFixture,
        status: "approved",
        render_status: "failed",
        rendered_video_url: null,
      },
      { role: "operador" },
    )

    expect(screen.queryByRole("button", { name: "Reintentar cierre" })).toBeNull()
  })

  it("explains an expired derivative and keeps the original testimony selected", () => {
    const props = panel({
      ...memoryImageFixture,
      status: "approved",
      render_status: "expired",
      rendered_video_url: null,
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "La versión con cierre ya no está disponible por la política de retención. "
      + "El testimonio original permanece disponible.",
    )
    expect(
      screen.queryByRole("button", { name: "Versión con cierre de memoria" }),
    ).toBeNull()
    // Un derivado vencido no se puede reintentar: el original ya venció con él.
    expect(screen.queryByRole("button", { name: "Reintentar cierre" })).toBeNull()
    expect(props.onVideoModeChange).not.toHaveBeenCalled()
  })

  it("switches the video source once the derivative is ready", () => {
    const props = panel({
      ...memoryImageFixture,
      status: "approved",
      render_status: "ready",
      rendered_video_url: "/api/v1/cases/case-fixture/rendered-video/stream",
    })
    const original = screen.getByRole("button", { name: "Testimonio original" })
    const memory = screen.getByRole("button", {
      name: "Versión con cierre de memoria",
    })

    expect(original).toHaveAttribute("aria-pressed", "true")
    expect(memory).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(memory)

    expect(props.onVideoModeChange).toHaveBeenCalledWith("memory")
  })

  it("marks the closing version as the selected source", () => {
    panel(
      {
        ...memoryImageFixture,
        status: "approved",
        render_status: "ready",
        rendered_video_url: "/api/v1/cases/case-fixture/rendered-video/stream",
      },
      { videoMode: "memory" },
    )

    expect(
      screen.getByRole("button", { name: "Versión con cierre de memoria" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: "Testimonio original" }),
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("announces the generation in progress without showing a stale image", () => {
    panel({
      ...memoryImageFixture,
      status: "generating",
      image_url: null,
      render_status: null,
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparando la imagen de cierre…",
    )
    expect(screen.queryByRole("img", { name: ALT_TEXT })).toBeNull()
  })

  it("offers to generate the closing when the case has no image yet", () => {
    panel(null)

    // "No configurado" mandaba a revisar el entorno; lo que falta es la imagen.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Este caso todavía no tiene imagen de cierre.",
    )
    // Sin este botón el caso quedaba sin imagen y sin forma de pedirla.
    expect(screen.getByRole("button", { name: "Generar cierre" })).toBeEnabled()
  })

  it("reports a claim in flight instead of offering the button twice", () => {
    panel(null, { claiming: true })

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparando la imagen de cierre…",
    )
    expect(screen.queryByRole("button", { name: "Generar cierre" })).toBeNull()
  })

  it("names the environment only when the provider is the thing that is missing", () => {
    panel({
      ...memoryImageFixture,
      status: "failed",
      failure_code: "image_provider_not_configured",
    })

    expect(screen.getByRole("status")).toHaveTextContent(
      "El proveedor de imágenes no está configurado",
    )
  })

  it("disables every control while a request is running and restores focus", async () => {
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    panel(
      { ...memoryImageFixture, status: "pending_review" },
      { onDecision: vi.fn(() => pending) },
    )
    const approve = screen.getByRole("button", { name: "Aprobar" })
    approve.focus()

    fireEvent.click(approve)

    expect(screen.getByRole("button", { name: "Aprobando…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Generar otra" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Descartar" })).toBeDisabled()

    release()
    await screen.findByRole("button", { name: "Aprobar" })

    // El foco no salta al principio del documento cuando la acción termina.
    expect(screen.getByRole("button", { name: "Aprobar" })).toHaveFocus()
  })

  it("surfaces a failed action in an alert without losing the controls", async () => {
    panel(
      { ...memoryImageFixture, status: "pending_review" },
      { onRegenerate: vi.fn(() => Promise.reject(new Error("Ya hay una generación activa"))) },
    )

    fireEvent.click(screen.getByRole("button", { name: "Generar otra" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay una generación activa",
    )
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  it("does not narrate the alleged events in the alternative text", () => {
    panel({ ...memoryImageFixture, status: "approved", render_status: "rendering" })

    const alt = screen.getByRole("img", { name: ALT_TEXT }).getAttribute("alt")

    expect(alt).toBe(ALT_TEXT)
    expect(alt).not.toMatch(/desplazamiento|violencia|familia|Tambo|Popayán/i)
  })
})

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "../../api/client"
import { caseFixture, memoryImageFixture } from "../../test/case-fixture"
import { AnalysisWorkspace } from "./analysis-workspace"
import { narrativeStageTransition } from "./motion"
import { VerificationPanel } from "./verification-panel"
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

  it("seeks the video to the selected transcript fragment", () => {
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
        name: /0:18la familia llegó a popayán/i,
      }),
    )

    expect(video.currentTime).toBe(18.4)
    expect(
      screen.getByRole("button", {
        name: /0:18la familia llegó a popayán/i,
      }),
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("opens one institutional route at a time", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    const opener = await screen.findByRole("button", {
      name: /atención inmediata/i,
    })
    expect(opener).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(opener)

    expect(opener).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("button", { name: /contactar el punto territorial/i }),
    ).toBeInTheDocument()

    fireEvent.click(opener)

    expect(opener).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("button", { name: /contactar el punto territorial/i }),
    ).not.toBeInTheDocument()
  })

  it("uses a distinct decorative photograph on every closed route card", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    await screen.findByRole("button", { name: /atención inmediata/i })

    const artworks = [
      screen.getByTestId("route-artwork-emergency"),
      screen.getByTestId("route-artwork-housing_stabilization"),
      screen.getByTestId("route-artwork-return_relocation"),
    ]
    const sources = artworks.map((artwork) => artwork.getAttribute("src"))

    expect(new Set(sources)).toHaveProperty("size", 3)
    artworks.forEach((artwork) => {
      expect(artwork).toHaveAttribute("alt", "")
      expect(artwork).toHaveAttribute("aria-hidden", "true")
    })
    expect(
      screen.queryByRole("img", { name: "Atención inmediata" }),
    ).not.toBeInTheDocument()
  })

  it("keeps the photograph while its route timeline is open", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    const opener = await screen.findByRole("button", {
      name: /atención inmediata/i,
    })
    expect(screen.getByTestId("route-artwork-emergency")).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(opener)
      // La suite fuerza movimiento reducido: 30 ms deja concluir la salida
      // anterior de 10 ms y prueba el estado estable, no un frame intermedio.
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    expect(screen.getByTestId("route-artwork-emergency")).toBeInTheDocument()
    expect(opener.closest("article")).toHaveClass("is-open")

    fireEvent.click(opener)

    expect(await screen.findByTestId("route-artwork-emergency")).toBeInTheDocument()
  })

  it("advances the route timeline up to the opened stop", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    fireEvent.click(
      await screen.findByRole("button", { name: /atención inmediata/i }),
    )
    const stop = screen.getByRole("button", {
      name: /contactar el punto territorial/i,
    })
    const item = stop.closest("li")

    expect(item).toHaveAttribute("data-reached", "true")

    fireEvent.click(stop)

    expect(stop).toHaveAttribute("aria-expanded", "true")
    expect(item).toHaveAttribute("data-reached", "true")
  })

  it("collapses the video rail to widen the stage", () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const toggle = screen.getByRole("button", { name: /ocultar el video/i })

    fireEvent.click(toggle)

    expect(
      screen.getByRole("button", { name: /mostrar el video/i }),
    ).toHaveAttribute("aria-expanded", "false")
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
        role="validador"
        onReview={vi.fn()}
      />,
    )

    expect(screen.getByRole("heading", { name: "Señales encontradas" })).toBeVisible()
    expect(screen.getByText("Confirmado")).toBeVisible()
    expect(screen.getByText("Inconsistente")).toBeVisible()
    expect(screen.getByText("No identificado")).toBeVisible()
    // Sólo se puede corregir lo que tiene valor: las dos señales sin valor
    // ofrecen elegirlo o registrarlo, no corregirlo.
    expect(
      screen.queryAllByRole("button", { name: /necesito corregirlo/i }),
    ).toHaveLength(0)
    expect(
      screen.getByRole("button", { name: /elegir el valor/i }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: /registrar el valor/i }),
    ).toBeVisible()
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
        name: /elegir el valor/i,
      }),
    )
    fireEvent.change(
      within(urgency as HTMLElement).getByLabelText("Valor confirmado"),
      { target: { value: "high" } },
    )
    fireEvent.click(
      within(urgency as HTMLElement).getByRole("button", {
        name: "Confirmar lectura",
      }),
    )

    // Confirmar ya no exige justificación: el motivo sólo se pide al corregir.
    expect(onReview).toHaveBeenCalledWith("fact-urgency", {
      action: "confirm",
      value: "high",
      reason: "",
    })
  })

  it("anotates a repeated signal once and points the other passages to it", () => {
    const insistente: (typeof caseFixture)["facts"][number] = {
      ...caseFixture.facts[0],
      id: "fact-recruitment",
      label: "Intento de vincular a un menor",
      value: true,
      verification_status: "inconsistent",
      evidence: [
        { segment_id: "segment-1", start_ms: 0, end_ms: 14200 },
        { segment_id: "segment-2", start_ms: 18400, end_ms: 31800 },
      ],
    }
    render(
      <VerificationPanel
        facts={[insistente]}
        role="validador"
        segments={caseFixture.segments}
        onReview={vi.fn()}
      />,
    )

    // La tarjeta se escribe una sola vez, en el primer pasaje.
    expect(
      screen.getAllByRole("heading", {
        name: "Intento de vincular a un menor",
      }),
    ).toHaveLength(1)
    // Un valor booleano se lee en español, no como "true".
    expect(screen.getByText("Sí")).toBeVisible()
    // El regreso queda anotado en la nota…
    expect(screen.getByText(/lo vuelve a decir en/i)).toBeVisible()
    // …y el segundo pasaje remite a ella en vez de repetirla.
    expect(
      screen.getByRole("button", { name: /ya anotado en 0:00/i }),
    ).toBeVisible()
    expect(
      screen.queryAllByRole("button", { name: /esto es correcto/i }),
    ).toHaveLength(1)
  })

  // La pantalla de carga se cubre completa en upload-panel.test.tsx, incluida
  // la validación de tipo y peso que antes no existía.
})


describe("AnalysisWorkspace guided journey", () => {
  const play = (video: HTMLVideoElement, ms: number) => {
    video.currentTime = ms / 1000
    fireEvent.timeUpdate(video)
  }

  // `timeupdate` se colapsa a un cuadro de animación, así que el avance nunca
  // es síncrono con el evento.
  const settle = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40))
  })

  const currentStage = () =>
    ["Escuchar", "Señales", "Ruta"].find(
      (name) =>
        screen.getByRole("button", { name }).getAttribute("aria-current") === "step",
    )

  it("reports a refused playback through the rail", async () => {
    render(
      <DocumentaryVideoRail
        source="blob:testimonio"
        segments={caseFixture.segments}
        activeSegmentId={null}
        playbackError="No se pudo reproducir el testimonio: NotSupportedError"
        onSegmentSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo reproducir el testimonio: NotSupportedError",
    )
  })

  it("moves to the signals once the testimony has been heard", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement
    fireEvent.play(video)

    // Mitad del relato: sigue escuchando.
    play(video, 20000)
    await settle()
    expect(currentStage()).toBe("Escuchar")

    // El último fragmento cierra en 31.8 s.
    play(video, 31800)
    await settle()

    expect(currentStage()).toBe("Señales")
  })

  it("does not advance while the testimony is paused", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement

    // Sin reproducir: el cabezal puede moverse al buscar, y aun así no avanza.
    play(video, 40000)
    await settle()

    expect(currentStage()).toBe("Escuchar")
  })

  it("stops advancing on its own once the person navigates", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    const video = screen.getByTestId("case-video") as HTMLVideoElement
    fireEvent.play(video)

    fireEvent.click(screen.getByRole("button", { name: "Escuchar" }))
    play(video, 31800)
    await settle()

    // Tomó el control: el recorrido ya no se mueve solo.
    expect(currentStage()).toBe("Escuchar")
  })

  it("closes the journey on the route stage when the testimony ends", async () => {
    render(
      <AnalysisWorkspace
        initialCase={caseFixture}
        role="operador"
        evidenceMinMs={30}
      />,
    )
    const video = screen.getByTestId("case-video") as HTMLVideoElement
    fireEvent.play(video)
    fireEvent.ended(video)

    // Señales conserva una permanencia mínima antes de cerrar en Ruta.
    expect(currentStage()).toBe("Señales")

    await waitFor(() => expect(currentStage()).toBe("Ruta"))
  })
})

describe("AnalysisWorkspace memory closing", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const withMemoryImage = (
    memoryImage: (typeof caseFixture)["memory_image"],
  ) => ({ ...caseFixture, memory_image: memoryImage })

  const openRouteStage = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    return screen.findByRole("heading", { name: "Cierre de memoria" })
  }

  it("downloads the protected image and shows it in the closing panel", async () => {
    const download = vi
      .spyOn(apiClient, "download")
      .mockResolvedValue(new Blob(["imagen"], { type: "image/png" }))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-image")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage(memoryImageFixture)}
        role="validador"
      />,
    )
    await openRouteStage()

    await waitFor(() => {
      expect(
        screen.getByRole("img", {
          name: "Imagen representativa del cierre de memoria del caso",
        }),
      ).toHaveAttribute("src", "blob:memory-image")
    })
    // El caso llega por prop: sólo se descarga la imagen, no el video remoto.
    expect(download).toHaveBeenCalledWith(
      "/api/v1/cases/case-fixture/memory-image/content",
    )
  })

  it("sends the approval and refreshes the case with the returned generation", async () => {
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["imagen"]))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-image")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const approved = {
      ...memoryImageFixture,
      status: "approved" as const,
      render_status: "rendering" as const,
    }
    const request = vi
      .spyOn(apiClient, "request")
      .mockImplementation(async (path: string) => {
        if (path.endsWith("/memory-image/decision")) {
          return { memory_image: approved } as never
        }
        return withMemoryImage(approved) as never
      })

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage(memoryImageFixture)}
        role="validador"
      />,
    )
    await openRouteStage()

    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))

    expect(await screen.findByText("Preparando versión con cierre…")).toBeVisible()
    expect(request).toHaveBeenCalledWith(
      "/api/v1/cases/case-fixture/memory-image/decision",
      { method: "POST", body: JSON.stringify({ action: "approve" }) },
    )
    expect(request).toHaveBeenCalledWith("/api/v1/cases/case-fixture")
  })

  it("plays the derivative when the closing version is selected", async () => {
    const download = vi
      .spyOn(apiClient, "download")
      .mockResolvedValue(new Blob(["video"]))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-video")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage({
          ...memoryImageFixture,
          status: "approved",
          render_status: "ready",
          rendered_video_url: "/api/v1/cases/case-fixture/rendered-video/stream",
        })}
        role="operador"
      />,
    )
    await openRouteStage()

    fireEvent.click(
      screen.getByRole("button", { name: "Versión con cierre de memoria" }),
    )

    // La franja anuncia qué versión suena; el original permanece intacto.
    expect(
      await screen.findByRole("button", {
        name: "Versión con cierre de memoria",
      }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByLabelText("Reproductor de la versión con cierre de memoria"),
    ).toBeInTheDocument()
    expect(download).not.toHaveBeenCalledWith(
      "/api/v1/cases/case-fixture/rendered-video/stream",
    )
  })

  it("returns to the original testimony when the derivative disappears", async () => {
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["video"]))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-video")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const expired = {
      ...memoryImageFixture,
      status: "approved" as const,
      render_status: "expired" as const,
      rendered_video_url: null,
    }
    vi.spyOn(apiClient, "request").mockImplementation(async (path: string) => {
      if (path.endsWith("/rendered-video/retry")) {
        return { memory_image: expired } as never
      }
      return withMemoryImage(expired) as never
    })

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage({
          ...memoryImageFixture,
          status: "approved",
          render_status: "failed",
          rendered_video_url: null,
        })}
        role="validador"
      />,
    )
    await openRouteStage()

    fireEvent.click(screen.getByRole("button", { name: "Reintentar cierre" }))

    await waitFor(() => {
      expect(
        screen.getByText(
          "La versión con cierre ya no está disponible por la política de retención."
          + " El testimonio original permanece disponible.",
        ),
      ).toBeVisible()
    })
    expect(
      screen.getByLabelText("Reproductor del testimonio ficticio"),
    ).toBeInTheDocument()
  })

  it("re-reads the case until the closing image finishes generating", async () => {
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["imagen"]))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-image")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const request = vi
      .spyOn(apiClient, "request")
      .mockResolvedValue(
        withMemoryImage({
          ...memoryImageFixture,
          status: "pending_review",
        }) as never,
      )

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage({
          ...memoryImageFixture,
          status: "generating",
          image_url: null,
        })}
        role="validador"
        closingPollMs={20}
      />,
    )
    await openRouteStage()

    // Partiendo de `generating`, el sondeo alcanza solo el estado estable. El
    // texto de "Preparando…" lo cubre la prueba unitaria del panel; afirmarlo
    // aquí sería una carrera contra el propio sondeo.
    expect(
      await screen.findByText("La imagen está pendiente de revisión."),
    ).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith("/api/v1/cases/case-fixture")

    const calls = request.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(request.mock.calls).toHaveLength(calls)
  })

  it("downloads and shows the image the moment polling reports it is ready", async () => {
    const download = vi
      .spyOn(apiClient, "download")
      .mockResolvedValue(new Blob(["imagen"], { type: "image/png" }))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-image")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(apiClient, "request").mockResolvedValue(
      withMemoryImage({ ...memoryImageFixture, status: "pending_review" }) as never,
    )

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage({
          ...memoryImageFixture,
          status: "generating",
          image_url: null,
        })}
        role="validador"
        closingPollMs={20}
      />,
    )
    await openRouteStage()

    // Al llegar `pending_review` por sondeo, el recurso protegido se descarga
    // sin que nadie recargue la página.
    const image = await screen.findByRole("img", {
      name: "Imagen representativa del cierre de memoria del caso",
    })
    expect(image).toHaveAttribute("src", "blob:memory-image")
    expect(download).toHaveBeenCalledWith(
      "/api/v1/cases/case-fixture/memory-image/content",
    )
  })

  it("does not poll a case whose closing already settled", async () => {
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["imagen"]))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:memory-image")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const request = vi.spyOn(apiClient, "request")

    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage(memoryImageFixture)}
        role="validador"
        closingPollMs={10}
      />,
    )
    await openRouteStage()
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(request).not.toHaveBeenCalled()
  })

  it("keeps the closing panel out of the case when there is no image", async () => {
    render(
      <AnalysisWorkspace
        initialCase={withMemoryImage(null)}
        role="validador"
      />,
    )
    await openRouteStage()

    // La etapa entra con opacidad 0: se espera a que termine para afirmar que
    // el mensaje queda realmente visible, no sólo montado.
    await waitFor(() => {
      expect(
        screen.getByText("El cierre visual no está configurado para este caso."),
      ).toBeVisible()
    })
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull()
  })
})


describe("Guided route narration", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  class FakeAudio {
    static instances: FakeAudio[] = []
    listeners: Record<string, Array<() => void>> = {}
    paused = true
    constructor(public src: string) {
      FakeAudio.instances.push(this)
    }
    addEventListener(name: string, fn: () => void) {
      (this.listeners[name] ??= []).push(fn)
    }
    removeAttribute() {}
    pause() { this.paused = true }
    play() { this.paused = false; return Promise.resolve() }
    end() { (this.listeners.ended ?? []).forEach((fn) => fn()) }
  }

  // La ruta del fixture tiene una sola parada: para probar el avance hace
  // falta una segunda a la cual pasar.
  const twoStopCase = {
    ...caseFixture,
    routes: caseFixture.routes.map((route) =>
      route.id === "route-emergency"
        ? {
            ...route,
            steps: [
              route.steps[0],
              {
                title: "Solicitar valoración de protección",
                key_point: "Pida que la acompañe el Ministerio Público.",
                instructions: "Puede pedirlo en la misma diligencia.",
                claims: [],
              },
            ],
          }
        : route,
    ),
  }

  const openRoute = async (data = twoStopCase) => {
    render(<AnalysisWorkspace initialCase={data} role="operador" />)
    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    fireEvent.click(
      await screen.findByRole("button", { name: /atención inmediata/i }),
    )
  }

  it("advances to the next stop when the voice finishes the current one", async () => {
    FakeAudio.instances = []
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:voz")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const download = vi
      .spyOn(apiClient, "download")
      .mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }))

    await openRoute()

    fireEvent.click(
      screen.getByRole("button", { name: "Escuchar la ruta guiada" }),
    )

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1))
    expect(download).toHaveBeenCalledWith(
      "/api/v1/cases/case-fixture/routes/route-emergency/steps/0/narration",
    )

    // La voz termina de explicar la parada: el recorrido pasa a la siguiente.
    await act(async () => {
      FakeAudio.instances[0].end()
    })

    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        "/api/v1/cases/case-fixture/routes/route-emergency/steps/1/narration",
      ))
  })

  it("stops the guide without leaving a voice running", async () => {
    FakeAudio.instances = []
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:voz")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["audio"]))

    await openRoute()
    fireEvent.click(
      screen.getByRole("button", { name: "Escuchar la ruta guiada" }),
    )
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1))

    fireEvent.click(screen.getByRole("button", { name: "Detener la guía" }))

    expect(FakeAudio.instances[0].paused).toBe(true)
    expect(
      screen.getByRole("button", { name: "Escuchar la ruta guiada" }),
    ).toBeInTheDocument()
  })

  it("says the guide is unavailable when the voice is not configured", async () => {
    vi.spyOn(apiClient, "download").mockRejectedValue(
      new Error("La narración no está configurada"),
    )

    await openRoute()

    fireEvent.click(
      screen.getByRole("button", { name: "Escuchar la ruta guiada" }),
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La narración no está configurada",
    )
  })
})


describe("AnalysisWorkspace restart", () => {
  it("returns to the intake without leaving the workspace", async () => {
    render(<AnalysisWorkspace initialCase={caseFixture} role="operador" />)
    expect(screen.getByTestId("case-video")).toBeInTheDocument()
    // Sólo se ofrece al final del recorrido, no en cada etapa.
    expect(screen.queryByRole("button", { name: /analizar otro/i })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Ruta" }))
    fireEvent.click(
      await screen.findByRole("button", { name: /analizar otro testimonio/i }),
    )

    // La pantalla de carga vuelve sin pasar por el inicio ni por el login.
    expect(await screen.findByTestId("soft-editorial-upload")).toBeInTheDocument()
    expect(screen.queryByTestId("case-video")).toBeNull()
  })

})

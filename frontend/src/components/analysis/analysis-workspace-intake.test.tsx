import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, apiClient } from "../../api/client"
import { extractAudio } from "../../audio/separar-audio"
import { caseFixture } from "../../test/case-fixture"
import { AnalysisWorkspace } from "./analysis-workspace"


vi.mock("../../audio/separar-audio", () => ({ extractAudio: vi.fn() }))


const VIDEO_ID = caseFixture.video_id

const intake = {
  video: {
    id: VIDEO_ID,
    filename: "testimonio.mp4",
    media_type: "video/mp4",
    size_bytes: 0,
    status: "receiving",
    is_demo: false,
    created_at: "2026-09-23T12:00:00Z",
  },
  analysis: {
    id: "analysis-fixture",
    video_id: VIDEO_ID,
    status: "queued",
    current_stage: null,
    events_url: "/api/v1/analyses/analysis-fixture/events",
  },
}

function sse(payload: Record<string, unknown>, state = "completed") {
  const data = JSON.stringify({ stage: "routes", state, payload })
  return new Response(`id: 1\nevent: routes\ndata: ${data}\n\n`)
}

function pickAndAnalyze() {
  const file = new File(["video"], "testimonio.mp4", { type: "video/mp4" })
  Object.defineProperty(file, "size", { value: 147 * 1024 * 1024 })
  const input = screen.getByLabelText("Archivo de video del testimonio") as HTMLInputElement
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
  fireEvent.click(screen.getByRole("button", { name: "Analizar este testimonio" }))
  return file
}

type Upload = typeof apiClient.upload


describe("AnalysisWorkspace — el audio primero", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:video-local")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(apiClient, "request").mockImplementation(async (path: string) => {
      if (path === "/api/v1/analyses/readiness") {
        return { link_ingest_enabled: false, link_ingest_max_seconds: 1800 } as never
      }
      return { ...caseFixture, video_status: "receiving" } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(extractAudio).mockReset()
  })

  it("starts the analysis with the audio, plays the local file and keeps sending the video", async () => {
    vi.mocked(extractAudio).mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }))
    let reportVideo: (fraction: number) => void = () => undefined
    let finishVideo: (value: unknown) => void = () => undefined
    const upload = vi.spyOn(apiClient, "upload").mockImplementation(
      (async (path: string, _body: FormData, onProgress: (fraction: number) => void) => {
        if (path === "/api/v1/videos/intake") return intake
        reportVideo = onProgress
        return new Promise<unknown>((resolve) => {
          finishVideo = resolve
        })
      }) as Upload,
    )
    vi.spyOn(apiClient, "openStream").mockResolvedValue(sse({ case_id: caseFixture.id }))
    const download = vi.spyOn(apiClient, "download").mockResolvedValue(new Blob(["remoto"]))

    render(<AnalysisWorkspace role="operador" />)
    await screen.findByLabelText("Archivo de video del testimonio")
    const file = pickAndAnalyze()

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    const [intakePath, intakeBody] = upload.mock.calls[0]
    expect(intakePath).toBe("/api/v1/videos/intake")
    expect(intakeBody.get("size_bytes")).toBe(String(147 * 1024 * 1024))
    expect(intakeBody.get("media_type")).toBe("video/mp4")
    expect(intakeBody.get("audio")).toBeInstanceOf(Blob)
    const [videoPath, videoBody, , options] = upload.mock.calls[1]
    expect(videoPath).toBe(`/api/v1/videos/${VIDEO_ID}/content`)
    expect(videoBody.get("file")).toBe(file)
    expect(options?.method).toBe("PUT")

    // El caso se abre con el archivo del equipo, sin bajarlo del servidor.
    const player = await screen.findByTestId("case-video")
    await waitFor(() => expect(player).toHaveAttribute("src", "blob:video-local"))
    expect(download).not.toHaveBeenCalledWith(caseFixture.video_stream_url)

    act(() => reportVideo(0.4))
    expect(
      await screen.findByText(/El video se sigue guardando en el servidor: 40 %/),
    ).toBeInTheDocument()

    vi.mocked(apiClient.request).mockResolvedValue({ ...caseFixture } as never)
    await act(async () => finishVideo(intake.video))
    await waitFor(() =>
      expect(screen.queryByText(/El video se sigue guardando/)).not.toBeInTheDocument(),
    )
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/cases/${caseFixture.id}`)
  })

  it("stops sending the video when the analysis ends without a case", async () => {
    vi.mocked(extractAudio).mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }))
    let signal: AbortSignal | undefined
    vi.spyOn(apiClient, "upload").mockImplementation(
      (async (path: string, _body: FormData, _onProgress: unknown, options?: { signal?: AbortSignal }) => {
        if (path === "/api/v1/videos/intake") return intake
        signal = options?.signal
        return new Promise(() => undefined)
      }) as Upload,
    )
    vi.spyOn(apiClient, "openStream").mockResolvedValue(
      sse({ case_id: null, routes: [] }, "not_applicable"),
    )

    render(<AnalysisWorkspace role="operador" />)
    await screen.findByLabelText("Archivo de video del testimonio")
    pickAndAnalyze()

    await waitFor(() => expect(signal?.aborted).toBe(true))
  })

  it("uploads the whole video when the browser cannot read its audio", async () => {
    vi.mocked(extractAudio).mockRejectedValue(new Error("sin audio"))
    const upload = vi.spyOn(apiClient, "upload").mockResolvedValue({
      ...intake.video,
      status: "uploaded",
    } as never)
    vi.mocked(apiClient.request).mockImplementation(async (path: string) => {
      if (path.endsWith("/analyses")) return intake.analysis as never
      return { link_ingest_enabled: false, link_ingest_max_seconds: 1800 } as never
    })
    vi.spyOn(apiClient, "openStream").mockReturnValue(new Promise(() => undefined))

    render(<AnalysisWorkspace role="operador" />)
    await screen.findByLabelText("Archivo de video del testimonio")
    pickAndAnalyze()

    await waitFor(() =>
      expect(apiClient.request).toHaveBeenCalledWith(
        `/api/v1/videos/${VIDEO_ID}/analyses`,
        { method: "POST" },
      ),
    )
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][0]).toBe("/api/v1/videos")
  })

  it("uploads the whole video when the server does not take the audio", async () => {
    vi.mocked(extractAudio).mockResolvedValue(new Blob(["wav"], { type: "audio/wav" }))
    const upload = vi.spyOn(apiClient, "upload").mockImplementation(
      (async (path: string) => {
        if (path === "/api/v1/videos/intake") throw new ApiError("Not Found", 404)
        return { ...intake.video, status: "uploaded" }
      }) as Upload,
    )
    vi.mocked(apiClient.request).mockImplementation(async (path: string) => {
      if (path.endsWith("/analyses")) return intake.analysis as never
      return { link_ingest_enabled: false, link_ingest_max_seconds: 1800 } as never
    })
    vi.spyOn(apiClient, "openStream").mockReturnValue(new Promise(() => undefined))

    render(<AnalysisWorkspace role="operador" />)
    await screen.findByLabelText("Archivo de video del testimonio")
    pickAndAnalyze()

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(upload.mock.calls[1][0]).toBe("/api/v1/videos")
  })

  it("does not claim the closing while the video is still arriving", async () => {
    const request = vi.mocked(apiClient.request)

    render(
      <AnalysisWorkspace
        initialCase={{ ...caseFixture, video_status: "receiving" }}
        role="validador"
      />,
    )

    expect(
      await screen.findByText("El video de este testimonio todavía no llega al servidor."),
    ).toBeInTheDocument()
    expect(request).not.toHaveBeenCalledWith(
      `/api/v1/cases/${caseFixture.id}/memory-image/regenerate`,
      expect.anything(),
    )
  })
})

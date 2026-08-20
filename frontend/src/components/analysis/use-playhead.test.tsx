import { act, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { caseFixture } from "../../test/case-fixture"
import { usePlayhead } from "./use-playhead"


function Harness() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const playhead = usePlayhead(video, {
    segments: caseFixture.segments,
    timeline: caseFixture.timeline,
    facts: caseFixture.facts,
  })

  return (
    <div>
      <video ref={setVideo} data-testid="video" />
      <output data-testid="segment">{playhead.activeSegment?.id ?? "none"}</output>
      <output data-testid="event">{playhead.activeEvent?.id ?? "none"}</output>
      <output data-testid="facts">
        {[...playhead.activeFactIds].sort().join(",") || "none"}
      </output>
      <output data-testid="duration">{playhead.durationMs}</output>
      <button
        type="button"
        onClick={() => playhead.selectSegment(caseFixture.segments[0])}
      >
        fijar primer fragmento
      </button>
      <button type="button" onClick={() => playhead.seekTo(20000)}>
        saltar a 20s
      </button>
    </div>
  )
}

// El hook colapsa timeupdate en un requestAnimationFrame, así que hay que
// dejar correr el cuadro antes de leer el resultado.
async function playAt(
  video: HTMLVideoElement,
  seconds: number,
  event = "timeupdate",
) {
  await act(async () => {
    Object.defineProperty(video, "currentTime", {
      value: seconds,
      configurable: true,
      writable: true,
    })
    video.dispatchEvent(new Event(event))
    await new Promise((resolve) => setTimeout(resolve, 32))
  })
}

describe("usePlayhead", () => {
  it("sigue la reproducción y marca el fragmento, el momento y las señales", async () => {
    render(<Harness />)
    const video = screen.getByTestId("video") as HTMLVideoElement

    expect(screen.getByTestId("segment")).toHaveTextContent("segment-1")

    await playAt(video, 20, "timeupdate")

    expect(screen.getByTestId("segment")).toHaveTextContent("segment-2")
    expect(screen.getByTestId("event")).toHaveTextContent("event-2")
    // Ambas señales del fixture apuntan a segment-2 con EvidenceRef.
    expect(screen.getByTestId("facts")).toHaveTextContent("fact-location,fact-urgency")
  })

  it("conserva el último fragmento dicho durante una pausa del relato", async () => {
    render(<Harness />)
    const video = screen.getByTestId("video") as HTMLVideoElement

    // 16s cae en el hueco entre segment-1 (…14.2s) y segment-2 (18.4s…).
    await playAt(video, 16, "timeupdate")

    expect(screen.getByTestId("segment")).toHaveTextContent("segment-1")
  })

  it("la selección explícita manda sobre el tiempo hasta que se reproduce", async () => {
    render(<Harness />)
    const video = screen.getByTestId("video") as HTMLVideoElement

    await playAt(video, 20, "timeupdate")
    expect(screen.getByTestId("segment")).toHaveTextContent("segment-2")

    act(() => {
      screen.getByRole("button", { name: "fijar primer fragmento" }).click()
    })
    expect(screen.getByTestId("segment")).toHaveTextContent("segment-1")
    expect(video.currentTime).toBe(0)

    // Aunque el tiempo avance, la selección se mantiene.
    await playAt(video, 20, "timeupdate")
    expect(screen.getByTestId("segment")).toHaveTextContent("segment-1")

    // Pulsar reproducir devuelve el mando al tiempo.
    act(() => {
      video.dispatchEvent(new Event("play"))
    })
    expect(screen.getByTestId("segment")).toHaveTextContent("segment-2")
  })

  it("seekTo mueve el video y actualiza el cabezal", () => {
    render(<Harness />)
    const video = screen.getByTestId("video") as HTMLVideoElement

    act(() => {
      screen.getByRole("button", { name: "saltar a 20s" }).click()
    })

    expect(video.currentTime).toBe(20)
    expect(screen.getByTestId("segment")).toHaveTextContent("segment-2")
  })

  it("deriva la duración del final más lejano del material", () => {
    render(<Harness />)

    expect(screen.getByTestId("duration")).toHaveTextContent("31800")
  })
})


// El caso real monta el espacio de trabajo sin video: la persona todavía está
// en la pantalla de carga. El <video> aparece después, cuando llega el caso.
function LateVideoHarness() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [ready, setReady] = useState(false)
  const playhead = usePlayhead(video, {
    segments: caseFixture.segments,
    timeline: caseFixture.timeline,
    facts: caseFixture.facts,
  })

  return (
    <div>
      {ready ? <video ref={setVideo} data-testid="video" /> : null}
      <output data-testid="event">{playhead.activeEvent?.id ?? "none"}</output>
      <button type="button" onClick={() => setReady(true)}>montar video</button>
    </div>
  )
}


describe("usePlayhead with a video that arrives later", () => {
  it("follows a video mounted after the workspace", async () => {
    render(<LateVideoHarness />)
    screen.getByRole("button", { name: "montar video" }).click()
    const video = await screen.findByTestId("video") as HTMLVideoElement

    await act(async () => {
      video.currentTime = 24
      video.dispatchEvent(new Event("timeupdate"))
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    // 24 s cae dentro del segundo momento (18.4 s - 31.8 s).
    expect(screen.getByTestId("event")).toHaveTextContent("event-2")
  })
})


describe("usePlayhead between moments", () => {
  it("keeps the last reached moment lit instead of going blank", async () => {
    render(<Harness />)
    const video = screen.getByTestId("video") as HTMLVideoElement

    await act(async () => {
      // 16 s cae en el hueco entre el primer momento (0-14.2 s) y el
      // segundo (18.4-31.8 s).
      video.currentTime = 16
      video.dispatchEvent(new Event("timeupdate"))
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    expect(screen.getByTestId("event")).toHaveTextContent("event-1")
  })
})

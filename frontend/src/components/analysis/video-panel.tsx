import { forwardRef, useEffect, useMemo } from "react"
import type React from "react"

import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function vttTimestamp(milliseconds: number) {
  const totalMs = Math.max(0, Math.floor(milliseconds))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

// Los subtitulos se arman en el navegador a partir de los mismos fragmentos
// que ya se piden para el riel de la transcripcion: no hay un endpoint de
// subtitulos aparte que mantener sincronizado con el backend.
function buildVtt(segments: Segment[]) {
  const cues = segments.map(
    (segment) =>
      `${vttTimestamp(segment.start_ms)} --> ${vttTimestamp(segment.end_ms)}\n${segment.text}`,
  )
  return ["WEBVTT", "", ...cues].join("\n\n")
}


export const DocumentaryVideoRail = forwardRef<
  HTMLVideoElement,
  {
    source: string | null
    segments: Segment[]
    activeSegmentId: string | null
    collapsed?: boolean
    frozenHeight?: number | null
    sourceLabel?: string
    playbackError?: string
    // Un aviso bajo el reproductor, como el de la subida que sigue en curso.
    note?: React.ReactNode
    ref2?: React.Ref<HTMLElement>
    onSegmentSelect: (segment: Segment) => void
    onToggle?: () => void
  }
>(function DocumentaryVideoRail(
  {
    source,
    segments,
    activeSegmentId,
    collapsed = false,
    frozenHeight,
    sourceLabel = "Reproductor del testimonio ficticio",
    playbackError = "",
    note = null,
    ref2,
    onSegmentSelect,
    onToggle,
  },
  ref,
) {
  const captionsUrl = useMemo(() => {
    if (!segments.length) return null
    return URL.createObjectURL(new Blob([buildVtt(segments)], { type: "text/vtt" }))
  }, [segments])

  useEffect(() => {
    return () => {
      if (captionsUrl) URL.revokeObjectURL(captionsUrl)
    }
  }, [captionsUrl])

  return (
    <aside
      ref={ref2}
      className={collapsed ? "documentary-rail is-collapsed" : "documentary-rail"}
      style={frozenHeight ? { height: frozenHeight } : undefined}
      aria-labelledby="video-title"
    >
      {/* El riel se pliega para devolverle ancho a la etapa; el video sigue
          montado para no perder la posición de reproducción. */}
      {onToggle ? (
        <button
          type="button"
          className="documentary-rail-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Mostrar el video" : "Ocultar el video"}
          onClick={onToggle}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} />
          </svg>
        </button>
      ) : null}
      <h2 id="video-title">Tu declaración</h2>
      <div className="documentary-video">
        <video
          ref={ref}
          data-testid="case-video"
          controls
          preload="metadata"
          src={source ?? undefined}
          aria-label={sourceLabel}
        >
          {captionsUrl ? (
            <track
              kind="captions"
              srcLang="es"
              label="Español"
              src={captionsUrl}
              default
            />
          ) : null}
        </video>
        {!source ? (
          <div className="video-placeholder" aria-hidden="true">
            <span>SENDA</span>
            <p>Preparando la vista local protegida…</p>
          </div>
        ) : null}
      </div>
      {playbackError ? (
        <p className="action-error" role="alert">
          {playbackError}
        </p>
      ) : null}
      {note}
      <div
        className="documentary-fragments"
        role="group"
        aria-label="Fragmentos de la transcripción"
      >
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            className={segment.id === activeSegmentId ? "is-active" : ""}
            aria-pressed={segment.id === activeSegmentId}
            aria-current={
              segment.id === activeSegmentId ? "true" : undefined
            }
            onClick={() => onSegmentSelect(segment)}
          >
            <time>{timestamp(segment.start_ms)}</time>
            <span>{segment.text}</span>
          </button>
        ))}
      </div>
    </aside>
  )
})

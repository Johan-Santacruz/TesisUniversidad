import { forwardRef } from "react"

import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


export const DocumentaryVideoRail = forwardRef<
  HTMLVideoElement,
  {
    source: string | null
    segments: Segment[]
    activeSegmentId: string | null
    onSegmentSelect: (segment: Segment) => void
  }
>(function DocumentaryVideoRail(
  { source, segments, activeSegmentId, onSegmentSelect },
  ref,
) {
  return (
    <aside className="documentary-rail" aria-labelledby="video-title">
      <h2 id="video-title">Tu declaración</h2>
      <div className="documentary-video">
        <video
          ref={ref}
          data-testid="case-video"
          controls
          preload="metadata"
          src={source ?? undefined}
          aria-label="Reproductor del testimonio ficticio"
        />
        {!source ? (
          <div className="video-placeholder" aria-hidden="true">
            <span>SIAD</span>
            <p>Vista local protegida</p>
          </div>
        ) : null}
      </div>
      <p className="privacy-caption">
        Caso ficticio · identidad protegida <span aria-hidden="true">●</span>
      </p>
      <div
        className="documentary-fragments"
        aria-label="Fragmentos de la transcripción"
      >
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            className={segment.id === activeSegmentId ? "is-active" : ""}
            aria-pressed={segment.id === activeSegmentId}
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

import { forwardRef } from "react"

import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]

function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


export const VideoPanel = forwardRef<
  HTMLVideoElement,
  {
    source: string | null
    segments: Segment[]
    activeSegmentId: string | null
    onSegmentSelect: (segment: Segment) => void
  }
>(function VideoPanel(
  { source, segments, activeSegmentId, onSegmentSelect },
  ref,
) {
  return (
    <section className="case-video-panel" aria-labelledby="video-title">
      <div className="video-panel-heading">
        <div>
          <p className="eyebrow">Evidencia audiovisual</p>
          <h2 id="video-title">Video del caso</h2>
        </div>
        <span>cifrado</span>
      </div>
      <div className="video-frame">
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
      <div className="segment-list" aria-label="Segmentos de transcripción">
        <h3>Transcripción segmentada</h3>
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            className={segment.id === activeSegmentId ? "is-active" : ""}
            onClick={() => onSegmentSelect(segment)}
          >
            <time>{timestamp(segment.start_ms)}</time>
            <span data-active={segment.id === activeSegmentId ? "true" : "false"}>
              {segment.text}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
})

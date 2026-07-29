import type { components } from "../../api/generated"


type Segment = components["schemas"]["TranscriptSegment"]


function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


export function ListeningStage({
  segments,
  activeSegmentId,
  onSelect,
}: {
  segments: Segment[]
  activeSegmentId: string | null
  onSelect: (segment: Segment) => void
}) {
  return (
    <section className="listening-stage" aria-labelledby="listening-summary">
      <div className="stage-section-heading">
        <div>
          <p className="eyebrow">Transcripción protegida</p>
          <h2 id="listening-summary">
            {segments.length} fragmentos vinculados al video
          </h2>
        </div>
        <p>Selecciona un fragmento para revisar el momento exacto.</p>
      </div>
      <ol>
        {segments.map((segment, index) => (
          <li key={segment.id}>
            <button
              type="button"
              className={segment.id === activeSegmentId ? "is-active" : ""}
              aria-pressed={segment.id === activeSegmentId}
              onClick={() => onSelect(segment)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <blockquote>{segment.text}</blockquote>
              <time>{timestamp(segment.start_ms)}</time>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

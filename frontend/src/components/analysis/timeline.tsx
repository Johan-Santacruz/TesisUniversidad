import { motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import { StatusBadge } from "./status-badge"


type TimelineEvent = components["schemas"]["TimelineEventRead"]


function timestamp(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


export function Timeline({
  events,
  selectedId,
  onSelect,
}: {
  events: TimelineEvent[]
  selectedId: string | null
  onSelect: (event: TimelineEvent) => void
}) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="timeline-section" aria-labelledby="timeline-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Relato ordenado</p>
          <h2 id="timeline-title">Línea de tiempo</h2>
        </div>
        <p>{events.length} momentos vinculados al video</p>
      </div>
      <div className="timeline-track">
        <motion.div
          className="tricolor-rail"
          data-testid="tricolor-rail"
          aria-hidden="true"
          initial={reduceMotion ? false : { scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.8 }}
        >
          <span />
          <span />
          <span />
        </motion.div>
        <ol className="timeline-events">
          {events.map((event, index) => (
            <motion.li
              key={event.id}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: reduceMotion ? 0 : index * 0.08,
                duration: reduceMotion ? 0.01 : 0.32,
              }}
            >
              <button
                type="button"
                className={selectedId === event.id ? "timeline-node is-selected" : "timeline-node"}
                onClick={() => onSelect(event)}
                aria-pressed={selectedId === event.id}
                aria-label={`${event.title}, minuto ${timestamp(event.start_ms)}`}
              >
                <span className="timeline-time">{timestamp(event.start_ms)}</span>
                <span className="timeline-copy">
                  <span className="timeline-kicker">Momento {index + 1}</span>
                  <strong>{event.title}</strong>
                  <span>{event.description}</span>
                  <StatusBadge
                    status={event.verification_status}
                    confidence={event.confidence_band}
                    origin={event.origin}
                  />
                </span>
              </button>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

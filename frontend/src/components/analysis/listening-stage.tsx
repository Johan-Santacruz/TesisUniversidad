import { useEffect, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import {
  narrativeChildTransition,
  narrativeStageStagger,
} from "./motion"


type Segment = components["schemas"]["TranscriptSegment"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]
type Fact = components["schemas"]["FactRead"]


function timestamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


function signalsWithin(facts: Fact[], from: number, to: number) {
  return facts.filter((fact) =>
    (fact.evidence ?? []).some(
      (evidence) => evidence.start_ms < to && evidence.end_ms > from,
    ))
}


export function ListeningStage({
  segments,
  timeline,
  facts,
  activeSegmentId,
  activeEventId,
  playing,
  onSelect,
  onSelectEvent,
}: {
  segments: Segment[]
  timeline: TimelineEvent[]
  facts: Fact[]
  activeSegmentId: string | null
  activeEventId: string | null
  playing: boolean
  onSelect: (segment: Segment) => void
  onSelectEvent: (event: TimelineEvent) => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const listRef = useRef<HTMLOListElement>(null)

  // Los momentos agrupan el relato por sentido; los fragmentos lo parten donde
  // hubo una pausa al hablar. Si el análisis no dejó momentos se muestran los
  // fragmentos para no dejar la etapa vacía.
  const moments = timeline ?? []
  const showMoments = moments.length > 0
  const activeId = showMoments ? activeEventId : activeSegmentId

  // Mientras el video corre, la lista sigue al relato sola: leer no debería
  // exigir perseguir el texto con la rueda del ratón.
  useEffect(() => {
    if (!playing || !activeId) return
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-entry-id="${activeId}"]`,
    )
    node?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    })
  }, [playing, activeId, reduceMotion])

  return (
    <section className="listening-stage" aria-labelledby="listening-summary">
      <div className="stage-section-heading">
        <div>
          <p className="eyebrow">
            {showMoments ? "Lo que ocurrió" : "Transcripción protegida"}
          </p>
          <h2 id="listening-summary">
            {showMoments
              ? `${moments.length} momentos del relato`
              : `${segments.length} fragmentos vinculados al video`}
          </h2>
        </div>
        <p>
          {showMoments
            ? "Elige un momento para verlo en el video. Mientras se reproduce, el relato avanza solo."
            : "Selecciona un fragmento para revisar el momento exacto."}
        </p>
      </div>

      <motion.ol
        ref={listRef}
        className="listening-entries"
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: narrativeStageStagger(
                showMoments ? moments.length : segments.length,
                reduceMotion,
                showMoments ? "sequence" : "set",
              ),
            },
          },
        }}
      >
        {showMoments
          ? moments.map((event, index) => {
              const signals = signalsWithin(facts, event.start_ms, event.end_ms)
              const isActive = event.id === activeEventId
              return (
                <motion.li
                  key={event.id}
                  data-entry-id={event.id}
                  variants={{
                    hidden: { opacity: 0, x: -14 },
                    visible: {
                      opacity: 1,
                      x: 0,
                      transition: narrativeChildTransition(reduceMotion, "sequence"),
                    },
                  }}
                >
                  <button
                    type="button"
                    className={isActive ? "listening-entry is-active" : "listening-entry"}
                    aria-pressed={isActive}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => onSelectEvent(event)}
                  >
                    <span className="listening-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="listening-body">
                      <strong><span>{event.title}</span></strong>
                      <small>{event.description}</small>
                      {/* Qué señales nacieron de este momento: la relación
                          viene de EvidenceRef, no se deduce. */}
                      {signals.length ? (
                        <span className="listening-signals">
                          {signals.map((fact) => (
                            <span key={fact.id} className="listening-signal">
                              {fact.label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <time>{timestamp(event.start_ms)}</time>
                  </button>
                </motion.li>
              )
            })
          : segments.map((segment, index) => {
              const isActive = segment.id === activeSegmentId
              return (
                <motion.li
                  key={segment.id}
                  data-entry-id={segment.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: narrativeChildTransition(reduceMotion),
                    },
                  }}
                >
                  <button
                    type="button"
                    className={isActive ? "listening-entry is-active" : "listening-entry"}
                    aria-pressed={isActive}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => onSelect(segment)}
                  >
                    <span className="listening-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="listening-body">
                      <strong>{segment.text}</strong>
                    </span>
                    <time>{timestamp(segment.start_ms)}</time>
                  </button>
                </motion.li>
              )
            })}
      </motion.ol>
    </section>
  )
}

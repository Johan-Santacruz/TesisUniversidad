import { motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import {
  narrativeChildTransition,
  narrativeStageStagger,
} from "./motion"


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
  const reduceMotion = useReducedMotion() ?? false

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
      <motion.ol
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: narrativeStageStagger(
                segments.length,
                reduceMotion,
              ),
            },
          },
        }}
      >
        {segments.map((segment, index) => (
          <motion.li
            key={segment.id}
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
              className={segment.id === activeSegmentId ? "is-active" : ""}
              aria-pressed={segment.id === activeSegmentId}
              aria-current={
                segment.id === activeSegmentId ? "true" : undefined
              }
              onClick={() => onSelect(segment)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <blockquote>{segment.text}</blockquote>
              <time>{timestamp(segment.start_ms)}</time>
            </button>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  )
}

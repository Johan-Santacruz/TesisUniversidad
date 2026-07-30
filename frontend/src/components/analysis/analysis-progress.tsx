import type { CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"

import type { AnalysisEvent, AnalysisStage } from "../../hooks/use-analysis-events"
import { staggerContainer, staggerItem } from "./motion"


const stages: Array<{ id: AnalysisStage; label: string }> = [
  { id: "audio", label: "Audio" },
  { id: "transcription", label: "Transcripción" },
  { id: "people_places", label: "Personas y lugares" },
  { id: "dates_facts", label: "Fechas y hechos" },
  { id: "classification", label: "Clasificación" },
  { id: "sources", label: "Fuentes" },
  { id: "timeline", label: "Línea de tiempo" },
  { id: "routes", label: "Rutas" },
]

const chapters = [
  { number: "01", title: "Escuchando", stages: ["audio", "transcription"] },
  {
    number: "02",
    title: "Ordenando",
    stages: ["people_places", "dates_facts", "classification", "sources"],
  },
  { number: "03", title: "Trazando", stages: ["timeline", "routes"] },
] as const


export function AnalysisProgress({
  events,
  error,
}: {
  events: AnalysisEvent[]
  error: string
}) {
  const reduceMotion = useReducedMotion()
  const states = new Map(events.map((event) => [event.stage, event.state]))
  const completedStages = Math.min(events.length, stages.length)
  const percent = Math.round((completedStages / stages.length) * 100)
  const currentStage = error ? undefined : stages[completedStages]?.id

  return (
    <section className="analysis-prelude" aria-labelledby="progress-title">
      <aside className="prelude-document">
        <p className="eyebrow">Procesamiento protegido</p>
        <h2>Tres capítulos, una sola lectura.</h2>
        <p>
          Cada resultado queda persistido antes de aparecer. La ruta solo se
          abre cuando el relato, los hechos y las fuentes están preparados.
        </p>
        <p className="processing-note">
          Puedes mantener esta ventana abierta mientras avanza el análisis.
        </p>
      </aside>
      <div className="narrative-sheet analysis-progress">
        <p className="eyebrow">Procesamiento cifrado</p>
        <h1 id="progress-title">Construyendo la lectura del caso</h1>
        <div className="progress-summary">
          <div
            className="progress-orbit"
            role="progressbar"
            aria-label="Progreso del análisis"
            aria-valuemin={0}
            aria-valuemax={stages.length}
            aria-valuenow={completedStages}
            style={{ "--analysis-progress": `${percent}%` } as CSSProperties}
          >
            <motion.strong
              key={percent}
              initial={reduceMotion ? false : { opacity: 0.5, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.42 }}
            >
              {percent}%
            </motion.strong>
            <span>{completedStages} de {stages.length}</span>
          </div>
          <p
            aria-live="polite"
            className={error ? "progress-message is-error" : "progress-message"}
          >
            {error
              ? error
              : `${completedStages} de ${stages.length} etapas persistidas`}
          </p>
        </div>
        <motion.ol
          className="progress-chapters"
          variants={staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {chapters.map((chapter) => (
            <motion.li key={chapter.number} variants={staggerItem}>
              <span>{chapter.number}</span>
              <div>
                <strong>{chapter.title}</strong>
                <ul>
                  {chapter.stages.map((stageId) => {
                    const stage = stages.find((item) => item.id === stageId)
                    const state = states.get(stageId)
                    const isPersisted = Boolean(state)
                    const isComplete = state === "completed"
                    const isCurrent = stageId === currentStage
                    const persistedStateDescription = state === "failed"
                      ? ", con error"
                      : state === "unavailable"
                        ? ", no disponible"
                        : ""
                    return (
                      <li
                        key={stageId}
                        className={[
                          isComplete ? "is-complete" : "",
                          isPersisted ? `state-${state}` : "",
                          isCurrent ? "is-current" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span aria-hidden="true" />
                        <span>{stage?.label}</span>
                        <small>
                          <span>
                            {isPersisted
                              ? "Persistida"
                              : isCurrent
                                ? "En curso"
                                : "En espera"}
                          </span>
                          {persistedStateDescription ? (
                            <span className="visually-hidden">
                              {persistedStateDescription}
                            </span>
                          ) : null}
                        </small>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}

import { motion, useReducedMotion } from "framer-motion"

import type { AnalysisEvent, AnalysisStage } from "../../hooks/use-analysis-events"


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


export function AnalysisProgress({
  events,
  error,
}: {
  events: AnalysisEvent[]
  error: string
}) {
  const reduceMotion = useReducedMotion()
  const states = new Map(events.map((event) => [event.stage, event.state]))
  const complete = events.length

  return (
    <section className="analysis-progress" aria-labelledby="progress-title">
      <p className="eyebrow">Procesamiento cifrado</p>
      <h1 id="progress-title">Construyendo la lectura del caso</h1>
      <p aria-live="polite">
        {error
          ? error
          : `${Math.min(complete, stages.length)} de ${stages.length} etapas persistidas`}
      </p>
      <div className="progress-rule" aria-hidden="true">
        <motion.span
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: Math.min(1, complete / stages.length) }}
          transition={{ duration: reduceMotion ? 0.01 : 0.45 }}
        />
      </div>
      <ol>
        {stages.map((stage, index) => {
          const state = states.get(stage.id)
          return (
            <li
              key={stage.id}
              className={state ? `is-complete state-${state}` : ""}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              <small>{state ? "Persistida" : "En espera"}</small>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

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
  const complete = events.length

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
        <p aria-live="polite" className={error ? "progress-message is-error" : "progress-message"}>
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
        <ol className="progress-chapters">
          {chapters.map((chapter) => (
            <li key={chapter.number}>
              <span>{chapter.number}</span>
              <div>
                <strong>{chapter.title}</strong>
                <ul>
                  {chapter.stages.map((stageId) => {
                    const stage = stages.find((item) => item.id === stageId)
                    const state = states.get(stageId)
                    return (
                      <li
                        key={stageId}
                        className={state ? `is-complete state-${state}` : ""}
                      >
                        <span aria-hidden="true" />
                        <span>{stage?.label}</span>
                        <small>{state ? "Persistida" : "En espera"}</small>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

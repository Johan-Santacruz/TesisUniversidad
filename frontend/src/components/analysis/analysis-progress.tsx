import type { CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"

import type { AnalysisEvent, AnalysisStage } from "../../hooks/use-analysis-events"
import { motionTransition, staggerContainer, staggerItem } from "./motion"


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

// Sólo estas cuentan como terreno ganado. Antes se contaban los eventos
// recibidos, así que una etapa fallida o no disponible sumaba porcentaje igual
// que una lograda y la barra prometía más de lo que había.
const SETTLED_STATES = new Set(["completed", "persisted", "skipped"])

type StageState = string | undefined

function statusLabel(state: StageState, isCurrent: boolean) {
  if (state === "failed") return "Con error"
  if (state === "unavailable") return "No disponible"
  if (state === "skipped") return "Omitida"
  if (state) return "Lista"
  return isCurrent ? "En curso" : "En espera"
}


export function AnalysisProgress({
  events,
  error,
  onRetry,
}: {
  events: AnalysisEvent[]
  error: string
  onRetry?: () => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const states = new Map(events.map((event) => [event.stage, event.state]))

  const settled = stages.filter(
    (stage) => SETTLED_STATES.has(String(states.get(stage.id))),
  ).length
  const failed = stages.filter((stage) => {
    const state = states.get(stage.id)
    return state === "failed" || state === "unavailable"
  }).length
  const percent = Math.round((settled / stages.length) * 100)

  // La etapa en curso es la primera sin noticias, no un índice contra el
  // arreglo: los eventos no tienen por qué llegar en ese orden.
  const currentStage = error
    ? undefined
    : stages.find((stage) => !states.has(stage.id))?.id

  const currentLabel = stages.find((stage) => stage.id === currentStage)?.label

  return (
    <section className="processing-view" aria-labelledby="progress-title">
      <header className="processing-head">
        <p className="eyebrow">Procesamiento protegido</p>
        <h1 id="progress-title">Construyendo la lectura del caso</h1>
        <p className="processing-lede">
          Cada resultado queda guardado antes de aparecer. La ruta se abre
          cuando el relato, los hechos y las fuentes están listos.
        </p>
      </header>

      <div className="processing-status">
        <div
          className="processing-meter"
          role="progressbar"
          aria-label="Progreso del análisis"
          aria-valuemin={0}
          aria-valuemax={stages.length}
          aria-valuenow={settled}
          aria-valuetext={`${settled} de ${stages.length} etapas listas`}
          style={{ "--analysis-progress": `${percent}%` } as CSSProperties}
        >
          <motion.span
            className="processing-meter-fill"
            initial={false}
            animate={{ scaleX: settled / stages.length }}
            transition={{ duration: reduceMotion ? 0.01 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="processing-readout">
          <strong>
            {settled} <span>de {stages.length} etapas</span>
          </strong>
          <p
            aria-live="polite"
            className={error ? "processing-message is-error" : "processing-message"}
          >
            {error
              ? error
              : currentLabel
                ? `Procesando ${currentLabel.toLocaleLowerCase("es")}…`
                : "Cerrando la lectura"}
          </p>
          {/* El fallo parcial no se esconde: el análisis puede terminar con
              etapas caídas y quien revisa debe saberlo antes de leer. */}
          {!error && failed ? (
            <p className="processing-warning" role="status">
              {failed === 1
                ? "1 etapa quedó sin resultado"
                : `${failed} etapas quedaron sin resultado`}
            </p>
          ) : null}
        </div>
        {error && onRetry ? (
          <button type="button" className="processing-retry" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>

      <motion.ol
        className="processing-chapters"
        variants={staggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        {chapters.map((chapter) => {
          const done = chapter.stages.every(
            (id) => SETTLED_STATES.has(String(states.get(id))),
          )
          const active = chapter.stages.some((id) => id === currentStage)
          return (
            <motion.li
              key={chapter.number}
              className={
                done ? "is-done" : active ? "is-active" : undefined
              }
              variants={staggerItem}
              transition={motionTransition(reduceMotion)}
            >
              <div className="processing-chapter-head">
                <span className="processing-chapter-number">{chapter.number}</span>
                <strong>{chapter.title}</strong>
              </div>
              <ul>
                {chapter.stages.map((stageId) => {
                  const stage = stages.find((item) => item.id === stageId)
                  const state = states.get(stageId)
                  const isCurrent = stageId === currentStage
                  return (
                    <li
                      key={stageId}
                      className={[
                        state ? `state-${state}` : "",
                        SETTLED_STATES.has(String(state)) ? "is-settled" : "",
                        isCurrent ? "is-current" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <span className="processing-dot" aria-hidden="true" />
                      <span className="processing-stage-label">{stage?.label}</span>
                      <small>{statusLabel(state, isCurrent)}</small>
                    </li>
                  )
                })}
              </ul>
            </motion.li>
          )
        })}
      </motion.ol>

      <p className="processing-note">
        Puedes mantener esta ventana abierta mientras avanza el análisis.
      </p>
    </section>
  )
}

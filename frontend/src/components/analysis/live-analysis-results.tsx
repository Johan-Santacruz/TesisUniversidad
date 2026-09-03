import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import type { components } from "../../api/generated"
import type { AnalysisEvent, AnalysisStage } from "../../hooks/use-analysis-events"
import {
  NARRATIVE_STAGES,
  type NarrativeStage,
} from "./narrative-stage"
import {
  narrativeChildTransition,
  narrativeStageTransition,
  useBatchCascade,
} from "./motion"


type Segment = components["schemas"]["TranscriptSegment"]
type Fact = components["schemas"]["FactRead"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]
type Route = components["schemas"]["RouteRead"]

const SETTLED_STATES = new Set(["completed", "persisted", "skipped"])

const WAITING_COPY: Record<NarrativeStage, { title: string; detail: string }> = {
  listening: {
    title: "Escuchando el testimonio",
    detail: "La transcripción aparecerá aquí apenas termine de procesarse el audio.",
  },
  evidence: {
    title: "Ordenando las señales",
    detail: "Los hechos y la clasificación se incorporarán sin recargar la página.",
  },
  route: {
    title: "Trazando las rutas",
    detail: "Las rutas aparecerán aquí cuando sus pasos y fuentes estén listos.",
  },
}


function latestEvent(events: AnalysisEvent[], stage: AnalysisStage) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].stage === stage) return events[index]
  }
  return undefined
}


function payloadArray<T>(
  events: AnalysisEvent[],
  stage: AnalysisStage,
  key: string,
): T[] {
  const value = latestEvent(events, stage)?.payload[key]
  return Array.isArray(value) ? value as T[] : []
}


function uniqueFacts(facts: Fact[]) {
  const found = new Map<string, Fact>()
  for (const fact of facts) {
    if (fact && typeof fact.id === "string") found.set(fact.id, fact)
  }
  return [...found.values()]
}


function stamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}


function readableValue(fact: Fact) {
  if (fact.display_value?.trim()) return fact.display_value
  if (Array.isArray(fact.value)) return fact.value.join(", ") || "Por confirmar"
  if (typeof fact.value === "boolean") return fact.value ? "Sí" : "No"
  if (fact.value === null || fact.value === undefined || fact.value === "") {
    return "Por confirmar"
  }
  return String(fact.value)
}


function stageIsReady(events: AnalysisEvent[], stage: NarrativeStage) {
  const eventStages: AnalysisStage[] = stage === "listening"
    ? ["transcription"]
    : stage === "evidence"
      ? ["people_places", "dates_facts", "classification"]
      : ["routes"]
  return eventStages.some((eventStage) => {
    const state = latestEvent(events, eventStage)?.state
    return SETTLED_STATES.has(String(state))
  })
}


function RollingCount({
  value,
  reduceMotion,
}: {
  value: number
  reduceMotion: boolean
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.strong
        key={value}
        initial={reduceMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        transition={{
          duration: reduceMotion ? 0.01 : 0.26,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        {value}
      </motion.strong>
    </AnimatePresence>
  )
}


function WaitingResult({ stage }: { stage: NarrativeStage }) {
  const copy = WAITING_COPY[stage]
  return (
    <div className="live-result-empty" role="status">
      <span className="live-result-pulse" aria-hidden="true" />
      <div>
        <h3>{copy.title}</h3>
        <p>{copy.detail}</p>
      </div>
    </div>
  )
}


function ListeningResult({
  segments,
  timeline,
  reduceMotion,
}: {
  segments: Segment[]
  timeline: TimelineEvent[]
  reduceMotion: boolean
}) {
  // Los hooks van antes del retorno temprano: la espera y el resultado son
  // el mismo componente.
  const segmentDelay = useBatchCascade(segments.length, reduceMotion, "sequence")
  const momentDelay = useBatchCascade(timeline.length, reduceMotion, "sequence")

  if (!segments.length) return <WaitingResult stage="listening" />

  return (
    <div className="live-listening-result">
      <div className="live-result-summary">
        <RollingCount value={segments.length} reduceMotion={reduceMotion} />
        <span>{segments.length === 1 ? "fragmento transcrito" : "fragmentos transcritos"}</span>
      </div>
      <ol className="live-transcript-list" aria-label="Transcripción parcial">
        {segments.map((segment, index) => (
          <motion.li
            key={segment.id}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...narrativeChildTransition(reduceMotion, "sequence"),
              delay: segmentDelay(index),
            }}
          >
            <span className="live-result-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p>{segment.text}</p>
            <time>{stamp(segment.start_ms)}</time>
          </motion.li>
        ))}
      </ol>
      {/* La línea de tiempo llega en su propio evento, bastante después que
          la transcripción: entra como bloque en vez de aparecer de golpe. */}
      <AnimatePresence initial={false}>
        {timeline.length ? (
          <motion.section
            className="live-timeline"
            aria-labelledby="live-timeline-title"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={narrativeChildTransition(reduceMotion, "sequence")}
          >
            <div className="live-subsection-heading">
              <h3 id="live-timeline-title">Línea de tiempo incorporada</h3>
              <span>{timeline.length} {timeline.length === 1 ? "momento" : "momentos"}</span>
            </div>
            <ol>
              {timeline.map((event, index) => (
                <motion.li
                  key={event.id}
                  initial={reduceMotion ? false : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    ...narrativeChildTransition(reduceMotion, "sequence"),
                    delay: momentDelay(index),
                  }}
                >
                  <time>{stamp(event.start_ms)}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.description}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  )
}


function EvidenceResult({
  facts,
  classification,
  sourceCount,
  reduceMotion,
}: {
  facts: Fact[]
  classification: Record<string, unknown>
  sourceCount: number
  reduceMotion: boolean
}) {
  const factDelay = useBatchCascade(facts.length, reduceMotion)
  const category = classification.category
  const subcategory = classification.subcategory
  const hasClassification = typeof category === "string"
    || typeof subcategory === "string"

  if (!facts.length && !hasClassification) {
    return <WaitingResult stage="evidence" />
  }

  return (
    <div className="live-evidence-result">
      <div className="live-result-summary">
        <RollingCount value={facts.length} reduceMotion={reduceMotion} />
        <span>{facts.length === 1 ? "señal encontrada" : "señales encontradas"}</span>
        <AnimatePresence initial={false}>
          {sourceCount ? (
            <motion.small
              initial={reduceMotion ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={narrativeChildTransition(reduceMotion)}
            >
              {sourceCount} {sourceCount === 1 ? "fuente lista" : "fuentes listas"}
            </motion.small>
          ) : null}
        </AnimatePresence>
      </div>
      {/* La clasificación llega de una vez y es una sola lectura: entra como
          un bloque, no escalonada. */}
      <AnimatePresence initial={false}>
        {hasClassification ? (
          <motion.dl
            className="live-classification"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={narrativeChildTransition(reduceMotion)}
          >
            {typeof category === "string" ? (
              <div>
                <dt>Categoría</dt>
                <dd>{category}</dd>
              </div>
            ) : null}
            {typeof subcategory === "string" ? (
              <div>
                <dt>Subcategoría</dt>
                <dd>{subcategory}</dd>
              </div>
            ) : null}
          </motion.dl>
        ) : null}
      </AnimatePresence>
      {facts.length ? (
        <div className="live-fact-grid">
          {facts.map((fact, index) => (
            <motion.article
              key={fact.id}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                ...narrativeChildTransition(reduceMotion, "sequence"),
                delay: factDelay(index),
              }}
            >
              <span className={fact.is_critical ? "is-critical" : undefined}>
                {fact.is_critical ? "Señal crítica" : "Señal encontrada"}
              </span>
              <h3>{fact.label}</h3>
              <p>{readableValue(fact)}</p>
              <small>
                {fact.verification_status === "confirmed"
                  ? "Lectura coincidente"
                  : "Pendiente de revisión humana"}
              </small>
            </motion.article>
          ))}
        </div>
      ) : null}
    </div>
  )
}


function RoutesResult({
  routes,
  reduceMotion,
}: {
  routes: Route[]
  reduceMotion: boolean
}) {
  const routeDelay = useBatchCascade(routes.length, reduceMotion, "sequence")

  if (!routes.length) return <WaitingResult stage="route" />

  return (
    <div className="live-routes-result">
      <p className="live-routes-disclaimer">
        Orientación preliminar. La disponibilidad y los requisitos se confirman con cada entidad.
      </p>
      <div className="live-route-grid">
        {routes.map((route, index) => {
          const steps = Array.isArray(route.steps) ? route.steps.length : 0
          return (
            <motion.article
              key={route.id}
              className={`route-${route.route_type}`}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                ...narrativeChildTransition(reduceMotion, "sequence"),
                delay: routeDelay(index),
              }}
            >
              <span>Ruta encontrada</span>
              <h3>{route.title}</h3>
              <p>{route.summary}</p>
              <small>{steps} {steps === 1 ? "paso listo" : "pasos listos"}</small>
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}


export function LiveAnalysisResults({ events }: { events: AnalysisEvent[] }) {
  const reduceMotion = useReducedMotion() ?? false
  const [stage, setStage] = useState<NarrativeStage>("listening")
  const segments = payloadArray<Segment>(events, "transcription", "segments")
  const timeline = payloadArray<TimelineEvent>(events, "timeline", "events")
  const facts = uniqueFacts([
    ...payloadArray<Fact>(events, "people_places", "facts"),
    ...payloadArray<Fact>(events, "dates_facts", "facts"),
  ])
  const routes = payloadArray<Route>(events, "routes", "routes")
  const sources = payloadArray<unknown>(events, "sources", "sources")
  const rawClassification = latestEvent(events, "classification")
    ?.payload.classification
  const classification = rawClassification
    && typeof rawClassification === "object"
    && !Array.isArray(rawClassification)
      ? rawClassification as Record<string, unknown>
      : {}
  const current = NARRATIVE_STAGES.find((item) => item.id === stage)
    ?? NARRATIVE_STAGES[0]
  const ready = stage === "listening"
    ? segments.length > 0
    : stage === "evidence"
      ? facts.length > 0
        || typeof classification.category === "string"
        || typeof classification.subcategory === "string"
      : routes.length > 0

  return (
    <section className="live-analysis-results" aria-labelledby="live-results-title">
      <header className="narrative-stage-header live-results-header">
        <p className="eyebrow">Resultado parcial</p>
        <div className="narrative-stage-meta">
          <nav aria-label="Resultados del análisis en curso">
            {NARRATIVE_STAGES.map((item) => {
              const ready = stageIsReady(events, item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    item.id === stage ? "is-current" : "",
                    ready ? "is-ready" : "is-waiting",
                  ].filter(Boolean).join(" ")}
                  aria-current={item.id === stage ? "step" : undefined}
                  onClick={() => setStage(item.id)}
                >
                  <span className="narrative-stage-marker" aria-hidden="true" />
                  <span className="narrative-stage-label">{item.shortTitle}</span>
                  <span className="visually-hidden">
                    {ready ? ", resultado disponible" : ", en proceso"}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>
        <div className="narrative-stage-title-row">
          <div>
            <h2 id="live-results-title">{current.title}</h2>
            <span className="narrative-title-rule" aria-hidden="true" />
            <p>{current.description}</p>
          </div>
        </div>
      </header>

      {/* Dos relevos distintos comparten la misma presencia: cambiar de
          pestaña y que la espera de una etapa se convierta en su resultado.
          La clave lleva ambos, así que el paso de "todavía nada" a la primera
          tanda de datos también se ve, en vez de sustituirse en seco. */}
      <div className="live-results-body" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${stage}:${ready ? "listo" : "espera"}`}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={narrativeStageTransition(reduceMotion)}
          >
            {stage === "listening" ? (
              <ListeningResult
                segments={segments}
                timeline={timeline}
                reduceMotion={reduceMotion}
              />
            ) : null}
            {stage === "evidence" ? (
              <EvidenceResult
                facts={facts}
                classification={classification}
                sourceCount={sources.length}
                reduceMotion={reduceMotion}
              />
            ) : null}
            {stage === "route" ? (
              <RoutesResult routes={routes} reduceMotion={reduceMotion} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="live-results-note">
        <span className="live-result-pulse" aria-hidden="true" />
        <p>Esta lectura se actualiza automáticamente. Puedes revisar lo que ya está listo.</p>
      </footer>
    </section>
  )
}

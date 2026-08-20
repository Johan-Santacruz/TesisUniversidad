import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import {
  narrativeChildTransition,
  narrativeStageStagger,
} from "./motion"
import { ReadAloud } from "./read-aloud"
import { StatusBadge } from "./status-badge"


type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]
type RouteRead = CaseData["routes"][number]
type SourceRead = CaseData["sources"][number]

/* Cada tipo de ruta tiene una escena propia. La imagen es decorativa: el
   título sigue siendo quien nombra la ruta para tecnologías de asistencia. */
const ROUTE_ARTWORK: Record<string, { src: string; position: string }> = {
  emergency: {
    src: "/images/routes/atencion-inmediata.webp",
    position: "center 48%",
  },
  housing_stabilization: {
    src: "/images/routes/estabilizacion-vivienda.webp",
    position: "center 52%",
  },
  return_relocation: {
    src: "/images/routes/retorno-reubicacion.webp",
    position: "center 50%",
  },
}

function RouteArtwork({
  routeType,
  reduceMotion,
}: {
  routeType: string
  reduceMotion: boolean
}) {
  const artwork = ROUTE_ARTWORK[routeType]
  if (!artwork) return null

  return (
    <motion.img
      alt=""
      aria-hidden="true"
      className="route-card-artwork"
      data-testid={`route-artwork-${routeType}`}
      decoding="async"
      draggable={false}
      src={artwork.src}
      style={{ objectPosition: artwork.position }}
      initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: reduceMotion ? 0.01 : 0.22,
        ease: [0.22, 1, 0.36, 1],
      }}
    />
  )
}


function RouteStops({
  caseId,
  route,
  sources,
  reduceMotion,
}: {
  caseId: string
  route: RouteRead
  sources: Map<string, SourceRead>
  reduceMotion: boolean
}) {
  const [openStep, setOpenStep] = useState<number | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [narrationError, setNarrationError] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const runRef = useRef(0)
  const panelId = useId()

  const stopNarration = useCallback(() => {
    // Cada arranque invalida al anterior: sin esto, pulsar dos veces deja dos
    // voces hablando encima de la misma ruta.
    runRef.current += 1
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
    }
    audioRef.current = null
    setNarrating(false)
  }, [])

  useEffect(() => stopNarration, [stopNarration])

  const narrateFrom = useCallback(
    async (index: number, run: number) => {
      if (run !== runRef.current) return
      if (index >= route.steps.length) {
        setNarrating(false)
        return
      }
      setOpenStep(index)
      try {
        const blob = await apiClient.download(
          `/api/v1/cases/${caseId}/routes/${route.id}/steps/${index}/narration`,
        )
        if (run !== runRef.current) return
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        // El final de la voz es la señal de avance: la parada siguiente se abre
        // cuando termina de explicarse la actual, no con un temporizador.
        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(url)
          void narrateFrom(index + 1, run)
        })
        await audio.play()
      } catch (caught) {
        if (run !== runRef.current) return
        setNarrating(false)
        setNarrationError(
          caught instanceof Error && caught.message
            ? caught.message
            : "No se pudo narrar la ruta",
        )
      }
    },
    [caseId, route.id, route.steps.length],
  )

  const toggleNarration = () => {
    if (narrating) {
      stopNarration()
      return
    }
    setNarrationError("")
    runRef.current += 1
    setNarrating(true)
    void narrateFrom(openStep ?? 0, runRef.current)
  }

  if (!route.steps.length) {
    return (
      <p className="route-empty">
        Los proveedores no acordaron pasos válidos para esta ruta.
      </p>
    )
  }

  // El trazo de avance llega hasta la parada abierta; sin ninguna abierta se
  // detiene en la primera, que es donde empieza el recorrido.
  const reached = openStep ?? 0
  const progress = route.steps.length > 1
    ? reached / (route.steps.length - 1)
    : 1

  const grounded = route.steps.filter((step) =>
    step.claims.length
    && step.claims.every((claim) => sources.has(claim.source_entry_id))).length

  return (
    <>
      {/* El recorrido se anuncia: cuántas paradas hay y cuántas tienen
          respaldo institucional verificable. */}
      {/* Antes vivían aquí tres cadenas que decían casi lo mismo: cuántas
          paradas, cuántas con fuente y en cuál vamos. Queda la posición, que
          es lo único que cambia mientras se recorre, y el aviso sólo si falta
          respaldo —una ausencia merece texto; una normalidad, no. */}
      <div className="route-stops-head">
        <span className="route-stops-position">
          Parada {reached + 1} de {route.steps.length}
        </span>
        {grounded === route.steps.length ? null : (
          <span className="route-stops-grounded">
            {route.steps.length - grounded} sin fuente verificable
          </span>
        )}
        <button
          type="button"
          className="route-narrate"
          aria-pressed={narrating}
          onClick={toggleNarration}
        >
          {narrating ? "Detener la guía" : "Escuchar la ruta guiada"}
        </button>
      </div>
      {narrationError ? (
        <p className="action-error" role="alert">{narrationError}</p>
      ) : null}
    <motion.ol
      className="route-stops"
      aria-label={`Pasos de ${route.title}`}
      style={{ "--route-steps": route.steps.length } as CSSProperties}
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren: reduceMotion ? 0 : 0.18,
            staggerChildren: reduceMotion ? 0 : 0.09,
          },
        },
      }}
    >
      <span className="route-stops-rail" aria-hidden="true">
        {/* El eje se traza de izquierda a derecha al abrir la ruta. */}
        <motion.span
          className="route-stops-rail-line"
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.55, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* El avance recorre el eje hasta la parada activa. */}
        <motion.span
          className="route-stops-rail-progress"
          initial={false}
          animate={{ scaleX: progress }}
          transition={{ duration: reduceMotion ? 0.01 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </span>
      {route.steps.map((step, index) => {
        const isOpen = openStep === index
        const isReached = index <= reached
        const ungrounded = step.claims.some(
          (claim) => !sources.has(claim.source_entry_id),
        )
        return (
          <motion.li
            key={`${route.id}-${step.title}`}
            className={isOpen ? "route-stop is-open" : "route-stop"}
            data-reached={isReached ? "true" : undefined}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: reduceMotion ? 0.01 : 0.34, ease: [0.16, 1, 0.3, 1] },
              },
            }}
          >
            {/* El nodo se apoya sobre el eje y marca el punto del recorrido.
                Vive fuera del botón para compartir fila con la línea. */}
            <span className="route-stop-node" aria-hidden="true">
              <motion.span
                className="route-stop-node-number"
                initial={false}
                animate={{ scale: isOpen ? 1.06 : 1 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                {index + 1}
              </motion.span>
            </span>
            <div className="route-stop-panel">
              <button
                type="button"
                className="route-stop-card"
                aria-expanded={isOpen}
                aria-controls={`${panelId}-${index}`}
                onClick={() => setOpenStep(isOpen ? null : index)}
              >
                <span className="visually-hidden">Parada {index + 1}.</span>
                <span className="route-stop-title">{step.title}</span>
                {step.key_point ? (
                  <span className="route-stop-key">{step.key_point}</span>
                ) : null}
                <span className="route-stop-hint" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
                    stroke="currentColor" strokeWidth="1.9"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d={isOpen ? "M4 10 8 6l4 4" : "M4 6.5 8 10.5l4-4"} />
                  </svg>
                </span>
                {/* La falta de respaldo institucional se anuncia sin exigir que
                    la parada esté abierta. */}
                {ungrounded ? (
                  <span className="route-stop-warning">
                    Sin fuente verificable · requiere revisión
                  </span>
                ) : null}
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    id={`${panelId}-${index}`}
                    className="route-stop-detail"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.24 }}
                  >
                    <div className="route-stop-listen">
                      <ReadAloud
                        text={[step.title, step.key_point, step.instructions]
                          .filter(Boolean)
                          .join(". ")}
                      />
                    </div>
                    <p className="route-stop-instructions">{step.instructions}</p>
                    {step.claims.map((claim) => {
                      const source = sources.get(claim.source_entry_id)
                      return (
                        <div
                          key={`${step.title}-${claim.source_entry_id}`}
                          className="grounded-claim"
                        >
                          <p>{claim.text}</p>
                          {source ? (
                            <div className="source-inspector">
                              {/* Lo que hay que saber antes de ir: requisitos,
                                  cobertura y vigencia. Todo viene de SourceRead;
                                  nada se infiere. */}
                              <dl>
                                <div>
                                  <dt>Requisitos</dt>
                                  <dd>{source.requirements}</dd>
                                </div>
                                <div>
                                  <dt>Cobertura</dt>
                                  <dd>{source.coverage}</dd>
                                </div>
                                <div>
                                  <dt>Contacto</dt>
                                  <dd>{source.contact}</dd>
                                </div>
                              </dl>
                              <p className="source-footer">
                                <a href={source.url} target="_blank" rel="noreferrer">
                                  {source.entity} · {source.program}
                                </a>
                                <span
                                  className={
                                    source.is_expired
                                      ? "source-validity is-expired"
                                      : "source-validity"
                                  }
                                >
                                  {source.is_expired
                                    ? "Vigencia vencida — confirmar con la entidad"
                                    : `Vigente hasta el ${new Date(source.expires_at).toLocaleDateString("es-CO")}`}
                                </span>
                              </p>
                              {source.disclaimer ? (
                                <strong>{source.disclaimer}</strong>
                              ) : null}
                            </div>
                          ) : (
                            <strong>Sin fuente institucional verificable.</strong>
                          )}
                        </div>
                      )
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.li>
        )
      })}
    </motion.ol>
    </>
  )
}


export function RoutesComparison({
  caseData,
  role,
  onApprove,
  onGoToSignals,
}: {
  caseData: CaseData
  role: Role
  onApprove: () => Promise<void> | void
  onGoToSignals?: () => void
}) {
  const reduceMotion = useReducedMotion() ?? false
  const sources = new Map(caseData.sources.map((source) => [source.id, source]))
  const canValidate = role === "validador" || role === "admin"
  const isFinal = caseData.recommendation_status === "final"
  const canApprove = canValidate && caseData.critical_inconsistencies === 0 && !isFinal
  const [approving, setApproving] = useState(false)
  const [approvalError, setApprovalError] = useState("")
  const [openRouteId, setOpenRouteId] = useState<string | null>(null)
  const approvingRef = useRef(false)

  const approve = async () => {
    if (!canApprove || approvingRef.current) return
    approvingRef.current = true
    setApproving(true)
    setApprovalError("")
    try {
      await onApprove()
    } catch (caught) {
      setApprovalError(
        caught instanceof Error && caught.message
          ? caught.message
          : "No se pudo aprobar la orientación. Inténtalo de nuevo.",
      )
    } finally {
      approvingRef.current = false
      setApproving(false)
    }
  }

  return (
    <section className="routes-section" aria-labelledby="routes-title">
      {/* El encabezado de la etapa ya nombra las rutas: aquí basta el estado de
          la recomendación y la advertencia. */}
      <div className="stage-section-heading routes-heading">
        <h2 id="routes-title" className="visually-hidden">
          Rutas institucionales
        </h2>
        <p className="routes-disclaimer">
          Confirme siempre disponibilidad y requisitos con la entidad.
        </p>
        <span className={isFinal ? "recommendation-label is-final" : "recommendation-label"}>
          {isFinal ? "Orientación final aprobada" : "Recomendación preliminar"}
        </span>
      </div>

      {/* El contrato no ata una ruta a un momento del testimonio, así que no se
          finge ese enlace. Lo que sí es real es que las señales críticas sin
          confirmar bloquean la aprobación: ésa es la relación que se muestra. */}
      {caseData.critical_inconsistencies && !isFinal ? (
        <div className="routes-gate" role="status">
          <span className="routes-gate-mark" aria-hidden="true" />
          <p>
            <strong>
              {caseData.critical_inconsistencies === 1
                ? "1 señal crítica sin confirmar"
                : `${caseData.critical_inconsistencies} señales críticas sin confirmar`}
            </strong>
            La orientación no puede aprobarse hasta resolverlas.
          </p>
          {onGoToSignals ? (
            <button type="button" onClick={onGoToSignals}>
              Ir a las señales <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <motion.div
        className="route-grid"
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: narrativeStageStagger(
                caseData.routes.length,
                reduceMotion,
              ),
            },
          },
        }}
      >
        {caseData.routes.map((route) => {
          const isOpen = route.id === openRouteId
          const ungroundedSteps = route.steps.filter((step) =>
            step.claims.some((claim) => !sources.has(claim.source_entry_id)),
          ).length
          return (
          <motion.article
            key={route.id}
            className={
              isOpen
                ? `route-journey route-${route.route_type} is-open`
                : `route-journey route-${route.route_type}`
            }
            data-testid="route-journey"
            variants={{
              hidden: { opacity: 0, y: 14 },
              visible: {
                opacity: 1,
                y: 0,
                transition: narrativeChildTransition(reduceMotion),
              },
            }}
          >
            {/* La cabecera abre y cierra la ruta: solo una se recorre a la vez,
                para que su línea de tiempo disponga de todo el ancho. */}
            <button
              type="button"
              className="route-journey-toggle"
              aria-expanded={isOpen}
              onClick={() => setOpenRouteId(isOpen ? null : route.id)}
            >
              <RouteArtwork
                routeType={route.route_type}
                reduceMotion={reduceMotion}
              />
              <h3>{route.title}</h3>
              <p>{route.summary}</p>
              <StatusBadge
                status={route.verification_status}
                confidence={route.confidence_band}
                origin={route.origin}
              />
              {/* El faltante de respaldo institucional se ve sin abrir la ruta. */}
              {ungroundedSteps ? (
                <span className="route-journey-warning">
                  Fuente no disponible — esta afirmación requiere revisión.
                </span>
              ) : null}
              <span className="route-journey-hint">
                {isOpen ? "Cerrar recorrido" : "Ver recorrido"}
                <span aria-hidden="true">{isOpen ? " ↑" : " →"}</span>
              </span>
            </button>
            {isOpen ? (
              <RouteStops
                caseId={caseData.id}
                route={route}
                sources={sources}
                reduceMotion={reduceMotion}
              />
            ) : null}
          </motion.article>
          )
        })}
      </motion.div>
      {canValidate ? (
        <div className="approval-bar">
          <div>
            <strong>
              {caseData.critical_inconsistencies
                ? `${caseData.critical_inconsistencies} ${
                    caseData.critical_inconsistencies === 1
                      ? "inconsistencia crítica pendiente"
                      : "inconsistencias críticas pendientes"
                  }`
                : "La revisión crítica está completa"}
            </strong>
            <p>La aprobación programa la eliminación del video a siete días.</p>
          </div>
          <div className="approval-action">
            <button
              type="button"
              disabled={!canApprove || approving}
              onClick={() => void approve()}
            >
              {approving ? "Aprobando…" : "Aprobar orientación final"}
            </button>
            {approvalError ? (
              <p className="action-error" role="alert">
                {approvalError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="role-note">
          Un validador debe confirmar los hechos críticos y aprobar la orientación.
        </p>
      )}
    </section>
  )
}

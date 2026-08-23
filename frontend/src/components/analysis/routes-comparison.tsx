import { useCallback, useEffect, useId, useRef, useState } from "react"
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

  // La parada abierta manda: el recorrido siempre muestra una y arranca por
  // la primera. Un panel vacío bajo el riel no diría nada.
  const current = openStep ?? 0
  const step = route.steps[current]

  const grounded = route.steps.filter((s) =>
    s.claims.length
    && s.claims.every((claim) => sources.has(claim.source_entry_id))).length
  const missing = route.steps.length - grounded

  return (
    <>
      {/* Dónde vamos, qué falta y cómo escucharlo: tres cosas distintas con
          tres pesos distintos. Antes iban seguidas y se leían como una frase. */}
      <div className="route-stops-head">
        <span className="route-stops-position">
          Parada {current + 1} de {route.steps.length}
          <span className="route-stops-route"> · {route.title}</span>
        </span>
        {missing ? (
          <span className="route-stops-grounded">
            {missing === 1
              ? "1 parada sin fuente verificable"
              : `${missing} paradas sin fuente verificable`}
          </span>
        ) : null}
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

      {/* El riel sólo lleva número y título: es el mapa del recorrido. Lo que
          hay que hacer en cada parada vive abajo, a ancho completo. */}
      <motion.ol
        className="route-stops"
        // Cinco es el techo que aguanta un diagrama horizontal legible; por
        // encima el recorrido se queda de pie, que es como se lee en un
        // teléfono. Apretar más no ayuda a nadie.
        data-diagrama={route.steps.length <= 5 ? "" : undefined}
        aria-label={`Pasos de ${route.title}`}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              delayChildren: reduceMotion ? 0 : 0.12,
              staggerChildren: reduceMotion ? 0 : 0.07,
            },
          },
        }}
      >
        {route.steps.map((item, index) => {
          const isOpen = index === current
          const ungrounded = item.claims.some(
            (claim) => !sources.has(claim.source_entry_id),
          )
          return (
            <motion.li
              key={`${route.id}-${item.title}`}
              className={isOpen ? "route-stop is-open" : "route-stop"}
              data-reached={index <= current ? "true" : undefined}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: reduceMotion ? 0.01 : 0.3,
                    ease: [0.16, 1, 0.3, 1],
                  },
                },
              }}
            >
              <button
                type="button"
                className="route-stop-card"
                aria-expanded={isOpen}
                aria-controls={isOpen ? `${panelId}-panel` : undefined}
                onClick={() => setOpenStep(index)}
              >
                <span className="route-stop-mark" aria-hidden="true">
                  <span className="route-stop-node">
                    <span className="route-stop-node-number">{index + 1}</span>
                  </span>
                  {/* El tramo nace en el centro de este nodo y muere en el del
                      siguiente: la línea no depende de ningún cálculo sobre el
                      ancho de las columnas. */}
                  <span className="route-stop-link" />
                </span>
                <span className="visually-hidden">Parada {index + 1}.</span>
                <span className="route-stop-title">{item.title}</span>
                {ungrounded ? (
                  <>
                    <span className="route-stop-flag" aria-hidden="true">!</span>
                    <span className="visually-hidden">
                      Sin fuente verificable.
                    </span>
                  </>
                ) : null}
              </button>
            </motion.li>
          )
        })}
      </motion.ol>

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={current}
          id={`${panelId}-panel`}
          className="route-stop-detail"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.22 }}
        >
          <div className="route-stop-detail-head">
            <span className="route-stop-detail-which">Parada {current + 1}</span>
            <h4>{step.title}</h4>
            <div className="route-stop-listen">
              <ReadAloud
                text={[step.title, step.key_point, step.instructions]
                  .filter(Boolean)
                  .join(". ")}
              />
            </div>
          </div>
          {step.key_point ? (
            <p className="route-stop-key">{step.key_point}</p>
          ) : null}
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
                    {/* La ficha guarda lo accionable —qué llevar y cómo
                        llegar—; quién atiende, dónde cubre y hasta cuándo van
                        juntos abajo, porque son los tres datos de la fuente y
                        no del trámite. Todo viene de SourceRead; nada se
                        infiere. */}
                    <dl>
                      <div>
                        <dt>Requisitos</dt>
                        <dd>{source.requirements}</dd>
                      </div>
                      <div>
                        <dt>Contacto</dt>
                        <dd>{source.contact}</dd>
                      </div>
                    </dl>
                    <p className="source-footer">
                      <span className="source-who">
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.entity} · {source.program}
                        </a>
                        <span className="source-scope">
                          Cubre {source.coverage}
                        </span>
                      </span>
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
      </AnimatePresence>
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

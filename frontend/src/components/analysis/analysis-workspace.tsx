import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { apiClient } from "../../api/client"
import type { components } from "../../api/generated"
import { useAnalysisEvents } from "../../hooks/use-analysis-events"
import { AnalysisProgress } from "./analysis-progress"
import { DeskSurface } from "../desk-surface"
import { EvidenceStage, riskLabelForFacts } from "./evidence-stage"
import { GuidedTour, WORKSPACE_TOUR } from "./guided-tour"
import { ListeningStage } from "./listening-stage"
import {
  NARRATIVE_STAGES,
  NarrativeStageHeader,
  type NarrativeStage,
} from "./narrative-stage"
import { MemoryImagePanel, type VideoMode } from "./memory-image-panel"
import { MemoryImagePlate } from "./memory-image-plate"
import { narrativeStageTransition, stageVariants } from "./motion"
import { RouteStage } from "./route-stage"
import { UploadPanel } from "./upload-panel"
import { usePlayhead } from "./use-playhead"
import { DocumentaryVideoRail } from "./video-panel"


type CaseData = components["schemas"]["CaseRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]
type VideoRead = components["schemas"]["VideoRead"]
type AnalysisRead = components["schemas"]["AnalysisRead"]
type AnalysisReadinessRead = components["schemas"]["AnalysisReadinessRead"]
type Fact = components["schemas"]["FactRead"]
type MemoryImage = components["schemas"]["MemoryImageRead"]
type MemoryImageDecision = components["schemas"]["MemoryImageDecisionRead"]


// Ritmo de sondeo mientras el cierre se genera o se renderiza.
export const MEMORY_CLOSING_POLL_MS = 4000

// Permanencia mínima en Señales cuando el relato cubre todo el video: sin
// esto la etapa pasaría en un parpadeo entre el último fragmento y el final.
export const EVIDENCE_MIN_MS = 9000

// El recorrido se ofrece una vez por navegador; después queda a un clic en
// "Ver de nuevo cómo funciona". Repetirlo en cada entrada sería un peaje.
export const TOUR_SEEN_KEY = "senda:recorrido-subida"

// La pantalla entra con una animación escalonada. Abrir el foco antes de que
// termine lo dejaría midiendo elementos que todavía se están colocando.
export const TOUR_DELAY_MS = 700


// Relevo entre carga, procesamiento y resultados.
function phaseMotion(reduceMotion: boolean) {
  if (reduceMotion) return {}
  return {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
    exit: { opacity: 0, y: -14, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] as const } },
  }
}


export function AnalysisWorkspace({
  initialCase,
  role,
  closingPollMs = MEMORY_CLOSING_POLL_MS,
  evidenceMinMs = EVIDENCE_MIN_MS,
}: {
  initialCase?: CaseData
  role: Role
  // Ritmos del recorrido; las pruebas los acortan.
  closingPollMs?: number
  evidenceMinMs?: number
}) {
  const [caseData, setCaseData] = useState<CaseData | null>(initialCase ?? null)
  const [eventsUrl, setEventsUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [narrativeStage, setNarrativeStage] = useState<NarrativeStage>("listening")
  const [stageDirection, setStageDirection] = useState(1)
  const [tourOpen, setTourOpen] = useState(false)
  const [plateOpen, setPlateOpen] = useState(false)
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  // El recorrido avanza solo mientras el testimonio suena; se apaga en cuanto
  // la persona navega por su cuenta.
  const [autoAdvance, setAutoAdvance] = useState(true)
  const stageRef = useRef<NarrativeStage>("listening")
  const autoAdvanceRef = useRef(true)
  const evidenceEnteredAtRef = useRef<number | null>(null)
  const routeTimerRef = useRef<number | undefined>(undefined)
  const evidenceMinMsRef = useRef(evidenceMinMs)
  evidenceMinMsRef.current = evidenceMinMs
  // Sólo la primera aparición del caso se coreografía; cambiar de etapa
  // después no vuelve a montar el número.
  const [revealing, setRevealing] = useState(false)
  const [videoSource, setVideoSource] = useState<string | null>(null)
  const [videoMode, setVideoMode] = useState<VideoMode>("original")
  const [memoryImageSource, setMemoryImageSource] = useState<string | null>(null)
  // Un caso puede llegar sin cierre: es anterior a la función, o su generación
  // inicial se perdió. El panel lo resuelve pidiéndolo, y mientras tanto esta
  // bandera es lo único que distingue "todavía no existe" de "viene en camino".
  const [claimingClosing, setClaimingClosing] = useState(false)
  const claimedClosingRef = useRef<string | null>(null)
  const [playbackError, setPlaybackError] = useState("")
  const [loadRemoteVideo, setLoadRemoteVideo] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  // El nodo vive en estado, no en un ref: así los efectos que lo escuchan
  // vuelven a correr cuando el video aparece, después de la pantalla de carga.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const railRef = useRef<HTMLElement>(null)
  // Al plegar, la franja conserva el alto que tenía el riel: si se encoge, su
  // punto medio sube y el botón salta a otra parte de la pantalla.
  const [railHeight, setRailHeight] = useState<number | null>(null)
  const reduceMotion = useReducedMotion() ?? false
  const stream = useAnalysisEvents(eventsUrl)

  useEffect(() => {
    if (!stream.caseId) return
    let active = true
    apiClient.request<CaseData>(`/api/v1/cases/${stream.caseId}`).then(
      (value) => {
        if (!active) return
        setCaseData(value)
        setBusy(false)
        setLoadRemoteVideo(true)
        // El caso llega por el análisis, no por una prop inicial: éste es el
        // momento que merece coreografía.
        setRevealing(true)
      },
      (caught) => {
        if (active) {
          setBusy(false)
          setError(caught instanceof Error ? caught.message : "No se pudo abrir el caso")
        }
      },
    )
    return () => {
      active = false
    }
  }, [stream.caseId])

  const changeStage = useCallback((next: NarrativeStage) => {
    const currentIndex = NARRATIVE_STAGES.findIndex(
      ({ id }) => id === stageRef.current,
    )
    const nextIndex = NARRATIVE_STAGES.findIndex(({ id }) => id === next)
    setStageDirection(nextIndex >= currentIndex ? 1 : -1)
    setNarrativeStage(next)
  }, [])

  // Cualquier navegación hecha por la persona apaga el avance automático: si
  // tomó el control, el recorrido no vuelve a moverse solo.
  const takeControl = useCallback((next: NarrativeStage) => {
    setAutoAdvance(false)
    window.clearTimeout(routeTimerRef.current)
    changeStage(next)
  }, [changeStage])

  useEffect(() => {
    stageRef.current = narrativeStage
    if (narrativeStage === "evidence" && evidenceEnteredAtRef.current === null) {
      evidenceEnteredAtRef.current = Date.now()
    }
  }, [narrativeStage])

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance
  }, [autoAdvance])

  useEffect(() => () => window.clearTimeout(routeTimerRef.current), [])

  const memoryImage = caseData?.memory_image ?? null
  const renderedVideoUrl = memoryImage?.rendered_video_url ?? null
  // La versión con cierre es un recurso aparte: si desaparece —render vencido,
  // rechazado o regenerado— la vista vuelve sola al testimonio original.
  const activeVideoUrl = videoMode === "memory" && renderedVideoUrl
    ? renderedVideoUrl
    : caseData?.video_stream_url ?? null

  useEffect(() => {
    if (videoMode === "memory" && !renderedVideoUrl) setVideoMode("original")
  }, [videoMode, renderedVideoUrl])

  useEffect(() => {
    if (!activeVideoUrl || !loadRemoteVideo) return
    let active = true
    let localUrl: string | null = null
    apiClient.download(activeVideoUrl).then(
      (blob) => {
        if (!active) return
        localUrl = URL.createObjectURL(blob)
        setVideoSource(localUrl)
      },
      () => {
        if (active) setVideoSource(null)
      },
    )
    return () => {
      active = false
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [activeVideoUrl, loadRemoteVideo])

  // La ruta de la imagen no cambia entre generaciones: la identidad y el estado
  // son los que deciden si hay que volver a descargar el recurso protegido.
  const memoryImageUrl = memoryImage?.image_url ?? null
  const memoryImageKey = memoryImage
    ? `${memoryImage.id}:${memoryImage.generation}:${memoryImage.status}`
    : null

  useEffect(() => {
    if (!memoryImageUrl || !memoryImageKey) {
      setMemoryImageSource(null)
      return
    }
    let active = true
    let localUrl: string | null = null
    apiClient.download(memoryImageUrl).then(
      (blob) => {
        if (!active) return
        localUrl = URL.createObjectURL(blob)
        setMemoryImageSource(localUrl)
      },
      () => {
        if (active) setMemoryImageSource(null)
      },
    )
    return () => {
      active = false
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [memoryImageUrl, memoryImageKey])

  // Generar la imagen y renderizar el derivado ocurren fuera del análisis, así
  // que el flujo de eventos ya terminó cuando arrancan. Con un proveedor real
  // la imagen tarda más de un minuto: sin volver a leer el caso, el panel se
  // queda en "Preparando…" hasta que alguien recargue la página.
  const caseId = caseData?.id ?? null
  const closingIsSettling = memoryImage?.status === "generating"
    || (memoryImage?.status === "approved"
        && memoryImage.render_status === "rendering")

  useEffect(() => {
    if (!caseId || !closingIsSettling) return
    let active = true
    const timer = window.setInterval(() => {
      apiClient.request<CaseData>(`/api/v1/cases/${caseId}`).then(
        (fresh) => {
          if (!active) return
          setCaseData((current) =>
            current && current.id === caseId ? fresh : current,
          )
        },
        () => {
          // Un sondeo fallido no interrumpe el caso: se reintenta al siguiente.
        },
      )
    }, closingPollMs)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [caseId, closingIsSettling, closingPollMs])

  // El relato termina donde termina su último fragmento, no donde termina el
  // archivo: un video con cola de silencio no debe retener a nadie en Escuchar.
  const narrationEndMs = useMemo(() => {
    const segments = caseData?.segments ?? []
    return segments.reduce((last, segment) => Math.max(last, segment.end_ms), 0)
  }, [caseData?.segments])

  // Un solo cabezal gobierna qué está activo en los tres módulos.
  const playhead = usePlayhead(video, {
    segments: caseData?.segments ?? [],
    timeline: caseData?.timeline ?? [],
    facts: caseData?.facts ?? [],
  })
  const activeSegment = playhead.activeSegment

  useEffect(() => {
    if (!video) return
    const start = () => {
      setPlaying(true)
      setPlaybackError("")
    }
    const stop = () => setPlaying(false)
    // Un fallo de medios no puede quedar mudo: el recorrido guiado entero
    // depende de que el testimonio suene.
    const fail = () => {
      setPlaying(false)
      setPlaybackError(
        video.error
          ? `No se pudo reproducir el testimonio (código ${video.error.code}).`
          : "No se pudo reproducir el testimonio.",
      )
    }
    const finish = () => {
      setPlaying(false)
      if (!autoAdvanceRef.current || stageRef.current === "route") return
      if (stageRef.current === "listening") changeStage("evidence")
      const enteredAt = evidenceEnteredAtRef.current ?? Date.now()
      const waited = Date.now() - enteredAt
      window.clearTimeout(routeTimerRef.current)
      routeTimerRef.current = window.setTimeout(
        () => {
          if (autoAdvanceRef.current) changeStage("route")
        },
        Math.max(0, evidenceMinMsRef.current - waited),
      )
    }
    video.addEventListener("play", start)
    video.addEventListener("pause", stop)
    video.addEventListener("ended", finish)
    video.addEventListener("error", fail)
    return () => {
      video.removeEventListener("play", start)
      video.removeEventListener("pause", stop)
      video.removeEventListener("ended", finish)
      video.removeEventListener("error", fail)
    }
  }, [video, changeStage])

  // Analizar otro testimonio era un callejón sin salida: había que volver al
  // inicio y entrar de nuevo. El caso ya está guardado en el servidor, así que
  // dejarlo no pierde nada; sólo se limpia lo que vive en esta pantalla.
  const startAnother = useCallback(() => {
    window.clearTimeout(routeTimerRef.current)
    evidenceEnteredAtRef.current = null
    setCaseData(null)
    setEventsUrl(null)
    setBusy(false)
    setError("")
    setNarrativeStage("listening")
    setStageDirection(1)
    setSelectedFactId(null)
    setPlaying(false)
    setAutoAdvance(true)
    setRevealing(false)
    setVideoSource(null)
    setVideoMode("original")
    setMemoryImageSource(null)
    setPlaybackError("")
    setLoadRemoteVideo(false)
    setRailCollapsed(false)
  }, [])

  const startAnalysis = async (video: VideoRead) => {
    const analysis = await apiClient.request<AnalysisRead>(
      `/api/v1/videos/${video.id}/analyses`,
      { method: "POST" },
    )
    setEventsUrl(analysis.events_url)
  }

  useEffect(() => {
    if (!autoAdvance || !playing) return
    if (narrativeStage !== "listening" || narrationEndMs <= 0) return
    if (playhead.currentMs >= narrationEndMs) changeStage("evidence")
  }, [
    autoAdvance,
    playing,
    narrativeStage,
    narrationEndMs,
    playhead.currentMs,
    changeStage,
  ])

  const useDemo = async () => {
    setBusy(true)
    setError("")
    setNarrativeStage("listening")
    setSelectedFactId(null)
    try {
      const video = await apiClient.request<VideoRead>("/api/v1/videos/demo", {
        method: "POST",
      })
      await startAnalysis(video)
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar la demostración")
    }
  }

  /* Qué sabe hacer este servidor. Hoy sólo se consulta por la ingesta desde
     enlace, que viene apagada: sin preguntar, la interfaz ofrecería un campo
     que devuelve 503. Si la consulta falla, no se ofrece y no se avisa —es una
     capacidad de más, no un fallo del análisis. */
  const [linkIngest, setLinkIngest] = useState<{ enabled: boolean; maxSeconds: number }>(
    { enabled: false, maxSeconds: 1800 },
  )

  const uploadLink = async (url: string) => {
    setBusy(true)
    setError("")
    setNarrativeStage("listening")
    setSelectedFactId(null)
    try {
      const video = await apiClient.request<VideoRead>("/api/v1/videos/link", {
        method: "POST",
        body: JSON.stringify({ url }),
        headers: { "Content-Type": "application/json" },
      })
      await startAnalysis(video)
    } catch (caught) {
      setBusy(false)
      setError(
        caught instanceof Error ? caught.message : "No se pudo traer el video",
      )
    }
  }

  const upload = async (file: File) => {
    setBusy(true)
    setError("")
    setNarrativeStage("listening")
    setSelectedFactId(null)
    const body = new FormData()
    body.append("file", file)
    try {
      const video = await apiClient.request<VideoRead>("/api/v1/videos", {
        method: "POST",
        body,
      })
      await startAnalysis(video)
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el video")
    }
  }

  const selectFact = (fact: Fact | null) => {
    setSelectedFactId(fact?.id ?? null)
    const first = fact?.evidence?.[0]
    if (first) playhead.seekTo(first.start_ms)
    if (fact && narrativeStage !== "evidence") takeControl("evidence")
  }

  const review = async (factId: string, payload: FactReview) => {
    if (!caseData) return
    const fact = await apiClient.request<components["schemas"]["FactRead"]>(
      `/api/v1/cases/${caseData.id}/facts/${factId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    )
    setCaseData((current) => {
      if (!current) return current
      const facts = current.facts.map((item) => item.id === fact.id ? fact : item)
      return {
        ...current,
        facts,
        critical_inconsistencies: facts.filter(
          (item) => item.is_critical && item.verification_status !== "confirmed",
        ).length,
      }
    })
  }

  // Las tres acciones del cierre comparten el mismo contrato: devuelven la
  // generación activa y luego se vuelve a leer el caso completo.
  const memoryImageAction = async (path: string, body?: string) => {
    if (!caseData) return
    const caseId = caseData.id
    const result = await apiClient.request<MemoryImageDecision>(
      `/api/v1/cases/${caseId}${path}`,
      { method: "POST", ...(body === undefined ? {} : { body }) },
    )
    setCaseData((current) =>
      current && current.id === caseId
        ? { ...current, memory_image: result.memory_image as MemoryImage }
        : current,
    )
    try {
      const refreshed = await apiClient.request<CaseData>(`/api/v1/cases/${caseId}`)
      setCaseData((current) => (current && current.id === caseId ? refreshed : current))
    } catch {
      // La decisión ya quedó registrada y auditada: la respuesta recibida
      // gobierna la vista hasta la próxima lectura del caso.
    }
  }

  // Un caso sin cierre no tiene por qué quedarse sin él. Los anteriores al
  // pipeline actual nunca tuvieron fila de imagen, y el panel se limitaba a
  // decirlo: se reclama aquí, al abrirlo. Una sola vez por caso —la generación
  // cuesta una llamada al proveedor y más de un minuto—, y sólo para quien
  // puede revisarla, que es quien el endpoint autoriza.
  useEffect(() => {
    if (!caseId || (role !== "validador" && role !== "admin")) return
    if (memoryImage !== null || claimedClosingRef.current === caseId) return
    claimedClosingRef.current = caseId
    setClaimingClosing(true)
    memoryImageAction("/memory-image/regenerate")
      .catch(() => {
        // Reclamarlo y no conseguirlo deja el caso como estaba; el panel
        // ofrece el botón para intentarlo a mano.
      })
      .finally(() => setClaimingClosing(false))
    // memoryImageAction se redefine en cada render y volvería a disparar el
    // efecto; el guardia por caso es lo que gobierna cuándo corre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, memoryImage, role])

  const approve = async () => {
    if (!caseData) return
    const approved = await apiClient.request<components["schemas"]["CaseApprovalRead"]>(
      `/api/v1/cases/${caseData.id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({
          confirmed_route_types: caseData.routes.map((route) => route.route_type),
        }),
      },
    )
    setCaseData({
      ...caseData,
      status: approved.status,
      recommendation_status: approved.recommendation_status,
      approved_at: approved.approved_at,
      routes: caseData.routes.map((route) => ({
        ...route,
        verification_status: "confirmed",
        confidence_band: "high",
      })),
    })
  }

  const onIntake = !caseData && !eventsUrl

  useEffect(() => {
    if (!onIntake) return
    let vigente = true
    apiClient
      .request<AnalysisReadinessRead>("/api/v1/analyses/readiness")
      .then((readiness) => {
        if (!vigente) return
        setLinkIngest({
          enabled: readiness.link_ingest_enabled,
          maxSeconds: readiness.link_ingest_max_seconds,
        })
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [onIntake])


  // El recorrido se ofrece con el caso ya analizado, que es donde hay algo que
  // aprender: la pantalla de subida se entiende sola. Espera a que la lámina
  // del cierre termine de retirarse para no encimarse con ella.
  useEffect(() => {
    if (onIntake || !caseData || plateOpen) return
    let seen = true
    try {
      seen = window.localStorage.getItem(TOUR_SEEN_KEY) === "visto"
    } catch {
      // Navegación privada: sin almacenamiento se prefiere no molestar antes
      // que ofrecer el recorrido una y otra vez sin poder recordar nada.
      seen = true
    }
    if (seen) return
    const timer = window.setTimeout(() => setTourOpen(true), TOUR_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [onIntake, caseData, plateOpen])

  const closeTour = useCallback(() => {
    setTourOpen(false)
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "visto")
    } catch {
      // Nada que hacer: se volverá a ofrecer, que es el mal menor.
    }
  }, [])

  // Las tres pantallas se relevan con mode="wait": la anterior termina de
  // salir antes de que entre la siguiente, para que la llegada del análisis
  // no sea un corte seco.
  if (onIntake) {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="upload" className="desk-stage" {...phaseMotion(reduceMotion)}>
          <DeskSurface />
          <UploadPanel
            busy={busy}
            error={error}
            linkIngestEnabled={linkIngest.enabled}
            linkMaxSeconds={linkIngest.maxSeconds}
            onUpload={upload}
            onLink={uploadLink}
            onDemo={useDemo}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  if (!caseData) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="progress"
          className="analysis-workspace analysis-live-workspace desk-stage"
          {...phaseMotion(reduceMotion)}
        >
          <DeskSurface />
          <AnalysisProgress
            events={stream.events}
            error={stream.error || error}
            onRetry={stream.retry}
          />
        </motion.div>
      </AnimatePresence>
    )
  }

  const riskLabel = riskLabelForFacts(caseData.facts)

  return (
    <div className="analysis-workspace desk-stage">
      <DeskSurface />
      <MemoryImagePlate
        imageSource={memoryImageSource}
        revealKey={memoryImageKey}
        onOpenChange={setPlateOpen}
      />
      <GuidedTour
        steps={WORKSPACE_TOUR}
        open={tourOpen}
        onClose={closeTour}
        onStageChange={(stage) => takeControl(stage as NarrativeStage)}
      />
      {/* El pliego: verso con el testimonio, recto con el análisis, lomo en
          medio y la misma mesa debajo que en la portada. */}
      <div
        className={
          railCollapsed
            ? "narrative-workspace-grid is-rail-collapsed"
            : "narrative-workspace-grid"
        }
      >
        <span className="book-spine" aria-hidden="true" />
        <DocumentaryVideoRail
          ref={setVideo}
          source={videoSource}
          segments={caseData.segments}
          activeSegmentId={activeSegment?.id ?? null}
          ref2={railRef}
          frozenHeight={railCollapsed ? railHeight : null}
          collapsed={railCollapsed}
          playbackError={playbackError}
          sourceLabel={
            videoMode === "memory"
              ? "Reproductor de la versión con cierre de memoria"
              : "Reproductor del testimonio ficticio"
          }
          onToggle={() => {
            setRailCollapsed((current) => {
              if (!current) setRailHeight(railRef.current?.offsetHeight ?? null)
              return !current
            })
          }}
          onSegmentSelect={playhead.selectSegment}
        />
        <main className="narrative-sheet" aria-live="polite">
          <NarrativeStageHeader
            stage={narrativeStage}
            onStageChange={takeControl}
            aside={
              narrativeStage === "evidence"
                ? (
                    <span className="risk-summary-header" role="status">
                      {riskLabel}
                    </span>
                  )
                : undefined
            }
          />

          <motion.div
            initial={revealing && !reduceMotion ? { opacity: 0, y: 12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setRevealing(false)}
          >
          <AnimatePresence mode="wait" initial={false} custom={stageDirection}>
            <motion.div
              key={narrativeStage}
              className="narrative-stage-content"
              custom={stageDirection}
              variants={stageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={narrativeStageTransition(reduceMotion)}
            >
              {narrativeStage === "listening" ? (
                <ListeningStage
                  segments={caseData.segments}
                  timeline={caseData.timeline}
                  facts={caseData.facts}
                  activeSegmentId={activeSegment?.id ?? null}
                  activeEventId={playhead.activeEvent?.id ?? null}
                  playing={playing}
                  onSelect={playhead.selectSegment}
                  onSelectEvent={playhead.selectEvent}
                />
              ) : null}
              {narrativeStage === "evidence" ? (
                <EvidenceStage
                  classification={caseData.classification}
                  facts={caseData.facts}
                  role={role}
                  segments={caseData.segments}
                  selectedStartMs={activeSegment?.start_ms}
                  selectedFactId={selectedFactId}
                  onSelectFact={selectFact}
                  onSeek={playhead.seekTo}
                  onReview={review}
                />
              ) : null}
              {narrativeStage === "route" ? (
                <RouteStage
                  caseData={caseData}
                  role={role}
                  onApprove={approve}
                  onGoToSignals={() => takeControl("evidence")}
                  memoryPanel={
                    <MemoryImagePanel
                      memoryImage={memoryImage}
                      claiming={claimingClosing}
                      role={role}
                      imageSource={memoryImageSource}
                      videoMode={videoMode}
                      onRegenerate={() =>
                        memoryImageAction("/memory-image/regenerate")}
                      onDecision={(action) =>
                        memoryImageAction(
                          "/memory-image/decision",
                          JSON.stringify({ action }),
                        )}
                      onRetryRender={() =>
                        memoryImageAction("/rendered-video/retry")}
                      onVideoModeChange={setVideoMode}
                    />
                  }
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
          </motion.div>
          <footer className="narrative-stage-actions">
            <p>
              {/* El recorrido se ofrece una vez. Sin esta puerta queda visto y
                  enterrado: nadie encuentra otra vez lo que ya cerró. */}
              <button
                type="button"
                className="tour-again"
                onClick={() => setTourOpen(true)}
              >
                Ver cómo funciona
              </button>
            </p>
            {/* La ranura de "qué sigue" recorre las tres etapas: revisar
                señales, continuar a la ruta y, cuando el recorrido termina,
                empezar otro. Antes vivía en el pie de todas y le disputaba la
                atención al avance. */}
            {narrativeStage !== "route" ? (
              <button
                type="button"
                onClick={() => takeControl(
                  narrativeStage === "listening" ? "evidence" : "route",
                )}
              >
                {narrativeStage === "listening"
                  ? "Revisar señales"
                  : "Continuar a la ruta"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                type="button"
                className="workspace-restart"
                onClick={startAnother}
              >
                Analizar otro testimonio{" "}
                <span aria-hidden="true">→</span>
              </button>
            )}
          </footer>
        </main>
      </div>
    </div>
  )
}

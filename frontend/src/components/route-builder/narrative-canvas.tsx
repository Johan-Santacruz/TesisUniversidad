import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react"
import { transcribeTestimony } from "../../services/chat-api"
import type { ActionPathData } from "../../types/action-path"
import { buildActionPathData } from "../../utils/action-path-builder"
import { RouteStepCard } from "./route-step-card"
import { SignalCard } from "./signal-card"
import { VideoPanel } from "./video-panel"

export type Phase = "escuchando" | "ordenando" | "trazando"
export type ProcessStatus = "idle" | "ready" | "processing" | "complete" | "error"

const phaseTitles: Record<Phase, { title: string; subtitle: string }> = {
  escuchando: {
    title: "Escuchando el relato",
    subtitle: "Estamos recogiendo tus palabras con cuidado, tal como las contaste.",
  },
  ordenando: {
    title: "Ordenando lo importante",
    subtitle: "Agrupamos lo que contaste en señales que ayudan a entender tu situación.",
  },
  trazando: {
    title: "Trazando la ruta",
    subtitle: "Conectamos las señales para dibujar un camino de acciones posibles.",
  },
}

const phaseOrder: Phase[] = ["escuchando", "ordenando", "trazando"]

const DEMO_TRANSCRIPT =
  "Vivíamos en una vereda del municipio de El Tambo, en el Cauca. Somos cinco personas: mi esposo, mis dos hijos, mi mamá y yo. Un grupo armado llegó a la finca y nos amenazó para que saliéramos esa misma noche. Huimos sin poder llevar los documentos ni la ropa de los niños. Mi hijo menor está enfermo y desde que llegamos no tenemos un lugar estable para dormir ni suficiente comida. Me da miedo regresar porque dijeron que nos estaban buscando."

const DEMO_CASE_BRIEF = {
  source: "video_transcript" as const,
  transcript: DEMO_TRANSCRIPT,
  transcriptPreview: DEMO_TRANSCRIPT.slice(0, 420),
  classification: {
    available: true,
    source: "classifier_service" as const,
    category: { label: "Desplazamiento forzado", confidence: 0.96 },
    subcategory: { label: "Amenazas y expulsión del territorio", confidence: 0.91 },
    riskLevel: "alto" as const,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
}

function HandUnderline() {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 12" className="mt-1 h-3 w-56 max-w-full" fill="none" preserveAspectRatio="none">
      <path d="M3 8 C 40 4, 90 10, 130 6 S 210 4, 237 7" stroke="var(--color-amarillo)" strokeWidth="3.5" strokeLinecap="round" className="animate-draw-underline" pathLength={240} />
    </svg>
  )
}

function ListeningBars() {
  const heights = [10, 18, 26, 14, 22, 30, 16, 24, 12, 20]
  return (
    <span className="flex h-8 items-center gap-[3px]" aria-hidden="true">
      {heights.map((height, index) => (
        <span key={index} className="animate-listen-bar w-[3px] rounded-full bg-azul/70" style={{ height: `${height}px`, animationDelay: `${index * 0.12}s` }} />
      ))}
    </span>
  )
}

function EmptyCanvas() {
  return (
    <div className="paper-card relative overflow-hidden border border-border bg-card px-6 py-8 shadow-[3px_4px_0_0_color-mix(in_oklch,var(--color-border)_70%,transparent)] sm:px-8 sm:py-10">
      <span aria-hidden="true" className="absolute right-5 top-5 font-serif text-6xl text-foreground/5">01</span>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Antes de comenzar</p>
      <h2 className="mt-3 max-w-lg font-serif text-3xl font-bold leading-tight text-foreground text-balance">Tu relato se convertirá en un camino que podrás revisar.</h2>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft text-pretty">Selecciona el video de tu declaración. Cuando decidas comenzar, verás cómo el sistema escucha, encuentra señales y construye cada paso de la ruta.</p>
      <div className="mt-8 grid gap-4 border-t border-dashed border-border pt-6 sm:grid-cols-3">
        {["Escuchar", "Ordenar", "Trazar"].map((label, index) => (
          <div key={label}>
            <span className="font-serif text-xs text-muted-foreground">0{index + 1}</span>
            <p className="mt-1 font-serif text-lg font-bold text-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function NarrativeCanvas() {
  const [phase, setPhase] = useState<Phase>("escuchando")
  const [status, setStatus] = useState<ProcessStatus>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [data, setData] = useState<ActionPathData | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [error, setError] = useState("")
  const [reduceMotion, setReduceMotion] = useState(false)
  const [isTurning, setIsTurning] = useState(false)
  const demoTimerRef = useRef<number | null>(null)
  const pageTimerRef = useRef<number | null>(null)
  const pointerStartRef = useRef<number | null>(null)
  const turningRef = useRef(false)

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  useEffect(() => () => {
    if (demoTimerRef.current) window.clearTimeout(demoTimerRef.current)
    if (pageTimerRef.current) window.clearTimeout(pageTimerRef.current)
  }, [])

  useEffect(() => {
    if (phase === "trazando" && data) setStatus("complete")
  }, [data, phase])

  const handleFile = (selected: File) => {
    const validType = selected.type.startsWith("video/") || /\.(mp4|mov|avi)$/i.test(selected.name)
    if (!validType) {
      setError("Selecciona un archivo de video MP4, MOV o AVI.")
      setStatus("error")
      return
    }
    if (selected.size > 100 * 1024 * 1024) {
      setError("El video supera el límite de 100 MB.")
      setStatus("error")
      return
    }

    setFile(selected)
    setIsDemo(false)
    setVideoUrl(URL.createObjectURL(selected))
    setData(null)
    setPhase("escuchando")
    setStatus("ready")
    setError("")
    setIsTurning(false)
    turningRef.current = false
  }

  const reset = () => {
    if (demoTimerRef.current) window.clearTimeout(demoTimerRef.current)
    if (pageTimerRef.current) window.clearTimeout(pageTimerRef.current)
    demoTimerRef.current = null
    pageTimerRef.current = null
    setFile(null)
    setVideoUrl(null)
    setData(null)
    setIsDemo(false)
    setPhase("escuchando")
    setStatus("idle")
    setError("")
    setIsTurning(false)
    turningRef.current = false
  }

  const runDemo = () => {
    if (demoTimerRef.current) window.clearTimeout(demoTimerRef.current)
    setFile(null)
    setVideoUrl(null)
    setIsDemo(true)
    setData(null)
    setPhase("escuchando")
    setStatus("processing")
    setError("")
    setIsTurning(false)
    turningRef.current = false

    demoTimerRef.current = window.setTimeout(() => {
      setData(buildActionPathData(DEMO_TRANSCRIPT, DEMO_CASE_BRIEF))
      demoTimerRef.current = null
    }, reduceMotion ? 350 : 1400)
  }

  const start = async () => {
    if (!file) return
    setStatus("processing")
    setPhase("escuchando")
    setData(null)
    setError("")
    setIsTurning(false)
    turningRef.current = false

    try {
      const result = await transcribeTestimony(file)
      setData(buildActionPathData(result.transcript, result.caseBrief))
    } catch (caught) {
      setStatus("error")
      setError(caught instanceof Error ? caught.message : "No fue posible analizar el video. Intenta nuevamente.")
    }
  }

  const advancePage = () => {
    if (!data || turningRef.current) return
    const currentIndex = phaseOrder.indexOf(phase)
    const nextPhase = phaseOrder[currentIndex + 1]
    if (!nextPhase) return

    turningRef.current = true
    setIsTurning(true)
    pageTimerRef.current = window.setTimeout(() => {
      setPhase(nextPhase)
      setIsTurning(false)
      turningRef.current = false
      pageTimerRef.current = null
    }, reduceMotion ? 20 : 520)
  }

  const handlePageClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, label, a, video")) return
    advancePage()
  }

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    pointerStartRef.current = event.clientX
  }

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (pointerStartRef.current !== null && pointerStartRef.current - event.clientX > 45) advancePage()
    pointerStartRef.current = null
  }

  const reviewSignals = () => {
    setPhase("ordenando")
    setStatus("processing")
  }

  const showSignals = Boolean(data) && phase === "ordenando"
  const showRoute = Boolean(data) && phase === "trazando"
  const hasStarted = status === "processing" || status === "complete"
  const phaseIndex = phaseOrder.indexOf(phase)
  const canAdvance = Boolean(data) && phaseIndex < phaseOrder.length - 1

  return (
    <div className={reduceMotion ? "motion-off" : ""}>
      <div className="route-builder-layout mx-auto grid max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[260px_1fr] lg:gap-8 lg:py-5">
        <VideoPanel phase={phase} status={status} file={file} videoUrl={videoUrl} isDemo={isDemo} error={error} onFileSelected={handleFile} onDemo={runDemo} onStart={start} onReset={reset} />

        <section aria-label="Construcción de tu ruta de acción" aria-live="polite" className="min-w-0">
          {!hasStarted && <EmptyCanvas />}

          {hasStarted && (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Hoja {phaseIndex + 1} de {phaseOrder.length}</p>
                <div className="flex items-center gap-5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={reduceMotion} onChange={(event) => setReduceMotion(event.target.checked)} className="h-3.5 w-3.5 accent-foreground" /> Reducir movimiento
                  </label>
                  <div className="flex items-center gap-2" aria-label={`Etapa ${phaseIndex + 1} de ${phaseOrder.length}`}>
                    {phaseOrder.map((item, index) => <span key={item} aria-hidden="true" className={`h-1.5 rounded-full transition-all duration-500 ${index === phaseIndex ? "w-8 bg-foreground" : index < phaseIndex ? "w-4 bg-azul" : "w-4 bg-border"}`} />)}
                  </div>
                </div>
              </div>

              <article
                key={phase}
                tabIndex={0}
                onClick={handlePageClick}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    advancePage()
                  }
                }}
                className={`route-stage-page ${isTurning ? "is-turning" : ""} ${canAdvance ? "cursor-pointer" : ""} relative min-h-[32rem] overflow-hidden border border-border bg-background px-5 py-5 outline-none sm:px-7 sm:py-6`}
                aria-label={`${phaseTitles[phase].title}. ${canAdvance ? "Toca o desliza la hoja para continuar." : "Ruta final."}`}
              >
              <header className="mb-5">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Del relato a la ruta</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <h2 key={phase} className="animate-fade-rise mt-1.5 font-serif text-3xl font-bold text-foreground text-balance xl:text-4xl">{phaseTitles[phase].title}</h2>
                    <HandUnderline key={`${phase}-line`} />
                  </div>
                  {phase === "escuchando" && <ListeningBars />}
                </div>
                <p key={`${phase}-sub`} className="animate-fade-rise mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft text-pretty" style={{ animationDelay: "200ms" }}>{phaseTitles[phase].subtitle}</p>
              </header>

              {phase === "escuchando" && !data && (
                <div className="paper-card animate-fade-rise border border-dashed border-border bg-card px-5 py-6">
                  <p className="font-serif text-lg italic text-ink-soft">El video se está transcribiendo. Los fragmentos aparecerán aquí cuando estén listos…</p>
                </div>
              )}

              {phase === "escuchando" && data && (
                <div className="relative pl-3" role="list" aria-label="Fragmentos de la transcripción">
                  <span aria-hidden="true" className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-foreground/50 via-foreground/25 to-transparent" />
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.fragments.map((fragment, index) => (
                      <figure key={fragment.id} role="listitem" className={`animate-paper-settle paper-card ${index % 2 === 1 ? "paper-card-alt" : ""} relative border border-border bg-card px-4 py-3 shadow-[2px_3px_0_0_color-mix(in_oklch,var(--color-border)_65%,transparent)]`} style={{ animationDelay: reduceMotion ? "0ms" : `${index * 380}ms`, "--tilt": `${index % 2 === 0 ? -0.35 : 0.3}deg` } as CSSProperties}>
                        <span aria-hidden="true" className="absolute -left-3 top-1/2 h-px w-3 bg-foreground/30" />
                        <blockquote className="font-serif text-sm italic leading-snug text-foreground xl:text-[15px]"><span className="marker-highlight" style={{ animationDelay: reduceMotion ? "0ms" : `${index * 380 + 220}ms` }}>{fragment.text}</span></blockquote>
                        <figcaption className="mt-1.5 text-[11px] text-muted-foreground">Fragmento {fragment.reference} de tu relato</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {showSignals && data && (
                <div id="builder-signals" className="relative scroll-mt-8">
                  {showRoute && <h3 className="mb-4 font-serif text-xl font-bold text-foreground">Señales conectadas con tu ruta</h3>}
                  <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Señales detectadas en el relato">
                    {data.signals.map((signal, index) => (
                      <div key={signal.id} role="listitem">
                        <SignalCard signal={signal} delay={reduceMotion || showRoute ? 0 : index * 450} tilt={index % 2 === 0 ? -0.4 : 0.35} alt={index % 3 === 1} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showRoute && data && (
                <div>
                  <div className="relative mb-4 overflow-hidden border-y border-foreground/20 px-1 py-3">
                    <div aria-hidden="true" className="absolute left-5 right-5 top-1/2 h-px bg-azul/35" />
                    <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" aria-label="Señales conectadas con la ruta">
                      {data.signals.map((signal, index) => (
                        <li key={signal.id} className="animate-stamp-in flex min-w-0 items-center gap-2 bg-background pr-2" style={{ animationDelay: `${index * 110}ms` }}>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-azul bg-background font-serif text-[10px] font-bold text-azul">{signal.numero}</span>
                          <span className="truncate text-[11px] font-medium text-ink-soft">{signal.titulo}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-xl font-bold text-foreground text-balance">Tu ruta de acción sugerida</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">Cada paso nace de una señal del relato.</p>
                    </div>
                    <p className="flex items-center gap-2 font-serif text-xs italic text-muted-foreground"><span aria-hidden="true" className="animate-ink-pulse h-2 w-2 rounded-full bg-azul" /> Ruta trazada para revisar</p>
                  </div>
                  <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {data.routeSteps.map((step, index) => <RouteStepCard key={step.id} step={step} delay={reduceMotion ? 0 : index * 150} isLast={index === data.routeSteps.length - 1} compact />)}
                  </ol>
                  <footer className="paper-card mt-3 border border-border bg-card px-4 py-3 lg:flex lg:items-center lg:justify-between lg:gap-4">
                    <p className="text-pretty max-w-lg font-serif text-xs italic leading-relaxed text-ink-soft">Esta orientación no reemplaza el acompañamiento humano. Si hay riesgo inmediato, busca ayuda urgente.</p>
                    <div className="mt-2 flex flex-wrap gap-2 lg:mt-0 lg:shrink-0">
                      <button type="button" onClick={() => window.print()} className="rounded-full border border-foreground bg-foreground px-4 py-2 text-xs text-primary-foreground transition-all hover:-translate-y-0.5">Usar esta ruta</button>
                      <button type="button" onClick={reviewSignals} className="rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground transition-colors hover:border-foreground">Revisar señales</button>
                      <button type="button" onClick={reset} className="rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground transition-colors hover:border-foreground">Analizar otro video</button>
                    </div>
                  </footer>
                </div>
              )}

              {canAdvance && (
                <button type="button" onClick={advancePage} className="route-page-cue group mt-5 ml-auto flex min-h-11 items-center gap-3 border-t border-dashed border-foreground/30 px-1 pt-3 text-right text-sm text-ink-soft transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
                  <span className="font-serif italic">Toca para pasar la hoja</span>
                  <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/35 transition-transform group-hover:translate-x-1">→</span>
                </button>
              )}
              </article>
              <p className="mt-3 text-center text-xs text-muted-foreground sm:hidden">También puedes deslizar la hoja hacia la izquierda.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

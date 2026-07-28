import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import type { Phase, ProcessStatus } from "./narrative-canvas"

const phaseStates: { phase: Phase; label: string }[] = [
  { phase: "escuchando", label: "Escuchando el relato" },
  { phase: "ordenando", label: "Ordenando lo importante" },
  { phase: "trazando", label: "Trazando y preparando la ruta" },
]

const phaseOrder: Phase[] = ["escuchando", "ordenando", "trazando"]

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function VideoPanel({
  phase,
  status,
  file,
  videoUrl,
  isDemo,
  error,
  onFileSelected,
  onDemo,
  onStart,
  onReset,
}: {
  phase: Phase
  status: ProcessStatus
  file: File | null
  videoUrl: string | null
  isDemo: boolean
  error: string
  onFileSelected: (file: File) => void
  onDemo: () => void
  onStart: () => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const currentIndex = status === "processing" || status === "complete" ? phaseOrder.indexOf(phase) : -1

  const selectFirst = (files: FileList | null) => {
    if (files?.[0]) onFileSelected(files[0])
  }

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => selectFirst(event.target.files)
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    selectFirst(event.dataTransfer.files)
  }

  return (
    <aside className="flex flex-col gap-4" aria-label="Video de la declaración y estado de procesamiento">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Tu declaración</p>
        <div className="relative overflow-hidden border border-border bg-card shadow-sm">
          {isDemo ? (
            <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden bg-foreground px-5 text-center text-primary-foreground">
              <span aria-hidden="true" className="absolute -right-12 -top-14 h-40 w-40 rounded-full border border-primary-foreground/10" />
              <span aria-hidden="true" className="absolute -bottom-20 -left-12 h-44 w-44 rounded-full border border-primary-foreground/10" />
              <span aria-hidden="true" className="animate-ink-pulse flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-primary-foreground/50 font-serif text-xl">▶</span>
              <p className="mt-4 font-serif text-lg font-bold">Declaración de prueba</p>
              <p className="mt-1 text-xs text-primary-foreground/65">Caso ficticio · identidad protegida</p>
            </div>
          ) : videoUrl ? (
            <video src={videoUrl} controls preload="metadata" className="aspect-video w-full bg-foreground/90 object-contain" aria-label="Vista previa de tu declaración" />
          ) : (
            <div
              onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex aspect-video flex-col items-center justify-center px-5 text-center transition-colors ${dragging ? "bg-amarillo/15" : "bg-secondary/65"}`}
            >
              <span aria-hidden="true" className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-foreground/50 font-serif text-2xl">↑</span>
              <p className="font-serif text-base font-bold text-foreground">Sube tu declaración en video</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">MP4, MOV o AVI · máximo 100 MB</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 rounded-full border border-foreground bg-foreground px-4 py-2 text-xs text-primary-foreground transition-transform hover:-translate-y-0.5">
                Elegir video
              </button>
              <button type="button" onClick={onDemo} className="mt-2 text-xs text-ink-soft underline decoration-dashed underline-offset-4 hover:text-foreground">
                Ver demostración con un caso ficticio
              </button>
            </div>
          )}
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi" onChange={handleInput} className="sr-only" />
          {(file || isDemo) && (
            <div className="flex flex-wrap items-center justify-between gap-1 bg-foreground/80 px-3 py-2">
              <span className="max-w-[68%] truncate font-sans text-xs text-primary-foreground">
                {isDemo ? "declaracion-prueba.mp4 · simulación" : `${file?.name} · ${formatSize(file?.size || 0)}`}
              </span>
              <button type="button" onClick={onReset} disabled={status === "processing"} className="font-sans text-xs italic text-primary-foreground/80 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50">Cambiar</button>
            </div>
          )}
        </div>

        {file && status !== "processing" && status !== "complete" && (
          <button type="button" onClick={onStart} className="mt-3 w-full rounded-full border border-foreground bg-foreground px-5 py-2.5 text-sm text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-4px_color-mix(in_oklch,var(--color-foreground)_40%,transparent)]">
            {status === "error" ? "Intentar nuevamente" : "Construir mi ruta"}
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-xs leading-relaxed text-rojo">{error}</p>}
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Estado</p>
        <ol className="flex flex-col gap-0">
          {phaseStates.map((state, index) => {
            const isDone = index < currentIndex || status === "complete"
            const isActive = index === currentIndex && status !== "complete"
            return (
              <li key={state.phase} className="relative flex gap-3 pb-3.5 last:pb-0">
                {index < phaseStates.length - 1 && <span aria-hidden="true" className={`absolute bottom-0 left-[5px] top-4 w-px ${isDone ? "bg-azul" : "bg-border"}`} />}
                <span aria-hidden="true" className={`mt-1 h-[11px] w-[11px] shrink-0 rounded-full border transition-colors duration-700 ${isDone ? "border-azul bg-azul" : isActive ? "border-azul bg-background" : "border-border bg-background"}`} />
                <span className={`text-sm leading-relaxed transition-colors duration-700 ${isActive ? "font-medium text-foreground" : isDone ? "text-ink-soft" : "text-muted-foreground"}`}>
                  {state.label}
                  {isActive && <span className="sr-only"> (en curso)</span>}
                  {isDone && <span className="sr-only"> (completado)</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="border border-border bg-card px-3.5 py-3">
        <p className="text-pretty font-serif text-xs italic leading-relaxed text-ink-soft">Esta orientación no reemplaza el acompañamiento humano. Si hay riesgo inmediato, busca ayuda urgente en la línea 123.</p>
      </div>
    </aside>
  )
}

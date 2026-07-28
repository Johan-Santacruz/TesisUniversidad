import { useState, type CSSProperties, type SVGProps } from "react"
import type { ActionSignal } from "../../types/action-path"

type Confirmation = "pendiente" | "correcta" | "corregir"

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function SignalCard({
  signal,
  delay,
  tilt = 0,
  alt = false,
}: {
  signal: ActionSignal
  delay: number
  tilt?: number
  alt?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>("pendiente")

  return (
    <article
      className={`animate-paper-settle paper-card ${alt ? "paper-card-alt" : ""} relative overflow-hidden border border-border bg-card shadow-[3px_4px_0_0_color-mix(in_oklch,var(--color-border)_70%,transparent)] hover:-translate-y-1 hover:shadow-[4px_7px_0_0_color-mix(in_oklch,var(--color-border)_80%,transparent)]`}
      style={{ animationDelay: `${delay}ms`, "--tilt": `${tilt}deg` } as CSSProperties}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span
          className="animate-stamp-in flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/40 font-serif text-sm font-bold text-ink-soft"
          style={{ animationDelay: `${delay + 300}ms` }}
          aria-hidden="true"
        >
          {signal.numero}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-serif text-base font-bold leading-snug text-foreground">{signal.titulo}</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{signal.evidencia}</p>
          {signal.incierta && (
            <p className="mt-2 inline-block rounded-full border border-amarillo/60 bg-amarillo/10 px-2.5 py-0.5 text-xs text-ink-soft">
              Podría requerir revisión
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-3 flex w-full items-center gap-1.5 border-t border-dashed border-border px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronIcon aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Ocultar la frase del relato" : "Ver la frase del relato que la originó"}
      </button>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <blockquote className="mx-4 mb-3 rounded-lg rounded-bl-sm border-l-[3px] border-amarillo bg-secondary px-3 py-2 font-serif text-sm italic leading-relaxed text-ink-soft">
            <span className={expanded ? "marker-highlight" : ""}>{signal.fraseOrigen}</span>
          </blockquote>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        {confirmation === "pendiente" ? (
          <>
            <button type="button" onClick={() => setConfirmation("correcta")} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-all hover:-translate-y-0.5 hover:border-azul hover:text-azul">
              <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Esto es correcto
            </button>
            <button type="button" onClick={() => setConfirmation("corregir")} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-all hover:-translate-y-0.5 hover:border-rojo hover:text-rojo">
              <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" /> Necesito corregirlo
            </button>
          </>
        ) : confirmation === "correcta" ? (
          <p className="animate-stamp-in flex items-center gap-1.5 text-xs text-azul">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Confirmado por ti.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setConfirmation("pendiente")}>Cambiar</button>
          </p>
        ) : (
          <p className="animate-stamp-in flex items-center gap-1.5 text-xs text-rojo">
            <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" /> Marcado para corregir antes de usar la ruta.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setConfirmation("pendiente")}>Cambiar</button>
          </p>
        )}
      </div>
    </article>
  )
}

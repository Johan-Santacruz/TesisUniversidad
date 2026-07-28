import type { CSSProperties } from "react"
import type { ActionRouteStep } from "../../types/action-path"

const urgencyLabel: Record<ActionRouteStep["urgencia"], string> = {
  inmediata: "Atención inmediata",
  prioritaria: "Atención prioritaria",
  importante: "Paso importante",
}

const urgencyStyles: Record<ActionRouteStep["urgencia"], string> = {
  inmediata: "border-rojo/50 bg-rojo/10 text-rojo",
  prioritaria: "border-amarillo/60 bg-amarillo/10 text-ink-soft",
  importante: "border-azul/40 bg-azul/10 text-azul",
}

export function RouteStepCard({ step, delay, isLast, compact = false }: { step: ActionRouteStep; delay: number; isLast: boolean; compact?: boolean }) {
  const number = Number(step.numero)
  const tilt = number % 2 === 0 ? 0.35 : -0.4

  if (compact) {
    return (
      <li>
        <article className={`animate-paper-settle paper-card ${number % 2 === 0 ? "paper-card-alt" : ""} h-full overflow-hidden border border-border bg-card shadow-[2px_3px_0_0_color-mix(in_oklch,var(--color-border)_65%,transparent)]`} style={{ animationDelay: `${delay}ms`, "--tilt": `${tilt}deg` } as CSSProperties}>
          <header className="flex items-start gap-2.5 border-b border-border px-3 py-2.5">
            <span className="animate-stamp-in flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/60 font-serif text-xs font-bold" style={{ animationDelay: `${delay + 160}ms` }}>{step.numero}</span>
            <div className="min-w-0 flex-1">
              <h4 className="text-balance font-serif text-[15px] font-bold leading-tight text-foreground">{step.nombre}</h4>
              <p className="mt-0.5 line-clamp-2 text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">{step.entidad}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] leading-none ${urgencyStyles[step.urgencia]}`}>{urgencyLabel[step.urgencia]}</span>
          </header>
          <div className="grid gap-2 px-3 py-2.5">
            <p className="text-xs leading-snug text-ink-soft">{step.porQue}</p>
            <p className="border-t border-dashed border-border pt-2 text-[11px] leading-snug text-muted-foreground"><span className="font-medium text-foreground">Preparar:</span> {step.quePreparar}</p>
          </div>
        </article>
      </li>
    )
  }

  return (
    <li className="relative flex gap-4 sm:gap-6">
      <div className="flex flex-col items-center">
        <span className="animate-stamp-in flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-foreground/60 bg-card font-serif text-sm font-bold text-foreground" style={{ animationDelay: `${delay}ms` }} aria-hidden="true">
          {step.numero}
        </span>
        {!isLast && <span aria-hidden="true" className="w-px flex-1 bg-foreground/30" />}
      </div>

      <article className={`animate-paper-settle paper-card ${number % 2 === 0 ? "paper-card-alt" : ""} mb-8 min-w-0 flex-1 overflow-hidden border border-border bg-card shadow-[3px_4px_0_0_color-mix(in_oklch,var(--color-border)_70%,transparent)]`} style={{ animationDelay: `${delay + 120}ms`, "--tilt": `${tilt}deg` } as CSSProperties}>
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h4 className="text-balance font-serif text-lg font-bold leading-snug text-foreground">{step.nombre}</h4>
            <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">{step.entidad}</p>
          </div>
          <span className={`animate-stamp-in rounded-full border px-2.5 py-1 text-xs ${urgencyStyles[step.urgencia]}`} style={{ animationDelay: `${delay + 400}ms` }}>
            {urgencyLabel[step.urgencia]}
          </span>
        </header>
        <dl className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Por qué aparece en tu ruta</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{step.porQue}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Qué podrías llevar o preparar</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{step.quePreparar}</dd>
          </div>
        </dl>
        <footer className="border-t border-dashed border-border px-4 py-2.5 sm:px-5">
          <p className="text-xs text-muted-foreground">Señal que originó este paso: <span className="font-serif italic text-ink-soft">{step.senalOrigen}</span></p>
        </footer>
      </article>
    </li>
  )
}

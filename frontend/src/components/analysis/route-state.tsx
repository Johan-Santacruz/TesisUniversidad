import type { ReactNode } from "react"
import "./route-state.css"

/** La ilustración acompaña la espera; no representa progreso del servidor. */
function RouteDrawing({ working }: { working: boolean }) {
  return (
    <svg className="route-state-drawing" data-working={working} viewBox="0 0 280 150" fill="none" aria-hidden="true">
      <ellipse cx="140" cy="136" rx="87" ry="7" fill="currentColor" opacity="0.035" />
      <path d="M42 24 107 14 175 28 238 18 238 122 175 132 107 118 42 128Z" className="route-map-paper" />
      <path d="M107 14V118M175 28V132" className="route-map-fold" />
      <g className="route-map-contours">
        <path d="M43 52C66 28 81 72 107 48S151 29 175 53 214 63 237 42" />
        <path d="M43 67C68 43 82 86 107 63S150 45 175 68 216 79 237 57" />
        <path d="M43 105C72 79 93 118 120 95S166 94 188 100 220 113 237 92" />
      </g>
      <path d="M66 104C112 104 80 59 130 67S170 101 192 76 185 43 218 43" className="route-map-guide" />
      <path d="M66 104C112 104 80 59 130 67S170 101 192 76 185 43 218 43" pathLength="1" className="route-map-trace" />
      <g className="route-map-point point-start"><circle cx="66" cy="104" r="8" /><circle cx="66" cy="104" r="2.5" /></g>
      <g className="route-map-point point-middle"><circle cx="148" cy="73" r="8" /><circle cx="148" cy="73" r="2.5" /></g>
      <g className="route-map-point point-end"><circle cx="218" cy="43" r="8" /><circle cx="218" cy="43" r="2.5" /></g>
    </svg>
  )
}

export function RouteState({ working = false, children }: { working?: boolean; children: ReactNode }) {
  return (
    <section className={`route-state${working ? " is-working" : ""}`} aria-labelledby="route-state-title">
      <RouteDrawing working={working} />
      <p className="route-state-eyebrow">{working ? "Trazando el siguiente paso" : "Antes de continuar"}</p>
      <h2 id="route-state-title">{working ? "Tu ruta toma forma." : "La ruta espera"}</h2>
      {children}
      <div className="route-state-rule" aria-hidden="true"><i /><i /><i /></div>
    </section>
  )
}

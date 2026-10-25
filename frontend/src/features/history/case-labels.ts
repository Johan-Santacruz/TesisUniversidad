import type { components } from "../../api/generated"


type CaseSummary = components["schemas"]["CaseSummaryRead"]

// Fecha larga, como la escribe el resumen en PDF: "24 de octubre de 2026".
const DATE = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
const TIME = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
})


export function caseDate(iso: string) {
  return DATE.format(new Date(iso))
}

export function caseTime(iso: string) {
  return TIME.format(new Date(iso))
}


/* El título de la fila es la categoría, como en el resumen en PDF. La
 * subcategoría no: está sin calibrar, y puesta de titular se leería como dato
 * del caso, que es justo lo que la pantalla de Señales evita. La referencia va
 * encima, como antetítulo: sirve para encontrar el caso en un PDF o nombrarlo
 * en una conversación, no para reconocerlo. */
export function caseTitle(summary: Pick<CaseSummary, "category">) {
  return summary.category ?? "Caso sin clasificar"
}


/* Lo que queda por hacer con el caso, en una línea. Las señales críticas sin
 * confirmar van primero porque son las que detienen la ruta. */
export function caseProgress(summary: CaseSummary) {
  const signals = summary.signals_total === 1
    ? "1 señal"
    : `${summary.signals_total} señales`
  if (summary.critical_pending) {
    return summary.critical_pending === 1
      ? `${signals} · 1 crítica sin confirmar`
      : `${signals} · ${summary.critical_pending} críticas sin confirmar`
  }
  if (summary.status === "approved") return `${signals} · orientación aprobada`
  if (summary.routes_status === "rebuilding") return `${signals} · ajustando la ruta`
  if (summary.routes_status === "rebuild_failed") return `${signals} · falta ajustar la ruta`
  return `${signals} · orientación por aprobar`
}


export function caseStatusLabel(summary: Pick<CaseSummary, "status">) {
  return summary.status === "approved" ? "Aprobado" : "En revisión"
}

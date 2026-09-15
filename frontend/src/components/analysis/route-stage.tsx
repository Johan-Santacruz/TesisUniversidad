import type { ReactNode } from "react"

import type { components } from "../../api/generated"
import { RoutesComparison } from "./routes-comparison"
import { RouteState } from "./route-state"


type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]


/* La ruta no se muestra mientras haya señales críticas sin confirmar.
 *
 * Antes se mostraba con un aviso encima. El aviso decía la verdad —que la
 * orientación no podía aprobarse— pero la ruta se leía igual, y una ruta que se
 * puede leer es una ruta que alguien va a seguir. Construida sobre una señal en
 * duda, es una ruta en duda.
 *
 * Se retiene sólo por las críticas y no por todas. Hay señales que salen sin
 * valor porque nadie las dijo —una fecha exacta que el testimonio no da— y
 * exigir resolverlas para poder avanzar sería exigir inventarlas, que es
 * justamente lo que este sistema no debe hacer.
 *
 * Y no se cierra la pestaña: se entra y lo que se encuentra es esto. Un botón
 * apagado no explica nada; esta pantalla dice qué falta, cuáles son y por dónde
 * se resuelve.
 */
function RouteGate({
  caseData,
  role,
  onGoToSignals,
}: {
  caseData: CaseData
  role: Role
  onGoToSignals?: () => void
}) {
  const pendientes = caseData.facts.filter(
    (fact) => fact.is_critical && fact.verification_status !== "confirmed",
  )
  const total = caseData.critical_inconsistencies || pendientes.length

  return (
    <RouteState>
      <p className="route-state-copy" role="status">
        <strong>{total === 1 ? "1 señal crítica sin confirmar" : `${total} señales críticas sin confirmar`}</strong>
        Confirma estos datos para construir una orientación que corresponda al caso.
      </p>

      {pendientes.length ? (
        <ul className="route-gate-list">
          {pendientes.map((fact) => (
            <li key={fact.id}>
              <strong>{fact.label}</strong>
              <span>
                {fact.value === null
                  ? "Por completar"
                  : "Por confirmar"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {onGoToSignals ? (
        <button type="button" className="route-state-action" onClick={onGoToSignals}>
          Ir a las señales <span aria-hidden="true">→</span>
        </button>
      ) : null}

      {role === "operador" ? (
        <p className="route-gate-note">
          Confirmar es cosa de un validador. Puedes pedir la corrección desde
          Señales para que alguien las resuelva.
        </p>
      ) : null}
    </RouteState>
  )
}


/* Confirmadas las señales críticas, la ruta se vuelve a construir con ellas.
 * Mientras tanto no se muestra la anterior: se leería como la definitiva y
 * es justo la que las señales confirmadas pueden cambiar. */
function RouteRebuilding() {
  return (
    <RouteState working>
      <p className="route-state-copy" role="status">
        <strong>Ajustando la ruta con las señales confirmadas…</strong>
        Estamos preparando los pasos y sus fuentes institucionales.
        La orientación aparecerá aquí cuando esté lista.
      </p>
      <p className="route-state-working"><span aria-hidden="true" />Preparando la orientación</p>
    </RouteState>
  )
}


export function RouteStage({
  caseData,
  role,
  memoryPanel,
  onApprove,
  onGoToSignals,
  onRetryRebuild,
}: {
  caseData: CaseData
  role: Role
  // El cierre de memoria llega como ranura: la etapa no necesita conocer sus
  // permisos ni sus llamadas, sólo dónde va después del recorrido.
  memoryPanel?: ReactNode
  onApprove: () => Promise<void> | void
  onGoToSignals?: () => void
  onRetryRebuild?: () => Promise<void> | void
}) {
  const retenida = caseData.facts.some(
    (fact) => fact.is_critical && fact.verification_status !== "confirmed",
  )
  const ajustando = !retenida && caseData.routes_status === "rebuilding"

  return (
    <div className={retenida || ajustando ? "route-stage is-waiting" : "route-stage"}>
      {retenida ? (
        <RouteGate
          caseData={caseData}
          role={role}
          onGoToSignals={onGoToSignals}
        />
      ) : ajustando ? (
        <RouteRebuilding />
      ) : (
        <RoutesComparison
          caseData={caseData}
          role={role}
          onApprove={onApprove}
          onGoToSignals={onGoToSignals}
          onRetryRebuild={onRetryRebuild}
        />
      )}
      {memoryPanel && (retenida || ajustando) ? (
        <details className="route-state-memory">
          <summary>Ver cierre de memoria</summary>
          {memoryPanel}
        </details>
      ) : memoryPanel}
    </div>
  )
}

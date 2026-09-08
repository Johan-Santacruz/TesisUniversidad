import type { ReactNode } from "react"

import type { components } from "../../api/generated"
import { RoutesComparison } from "./routes-comparison"


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
    <section className="routes-section route-gate-section" aria-live="polite">
      <p className="eyebrow">Control humano</p>
      <h2>La ruta espera</h2>

      <div className="routes-gate" role="status">
        <span className="routes-gate-mark" aria-hidden="true" />
        <p>
          <strong>
            {total === 1
              ? "1 señal crítica sin confirmar"
              : `${total} señales críticas sin confirmar`}
          </strong>
          La orientación no se muestra hasta resolverlas: una ruta construida
          sobre una señal en duda es una ruta en duda.
        </p>
        {onGoToSignals ? (
          <button type="button" onClick={onGoToSignals}>
            Ir a las señales <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      {pendientes.length ? (
        <ul className="route-gate-list">
          {pendientes.map((fact) => (
            <li key={fact.id}>
              <strong>{fact.label}</strong>
              <span>
                {fact.value === null
                  ? "sin valor: hay que resolverla"
                  : "sin confirmar"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {role === "operador" ? (
        <p className="route-gate-note">
          Confirmar es cosa de un validador. Puedes pedir la corrección desde
          Señales para que alguien las resuelva.
        </p>
      ) : null}
    </section>
  )
}


export function RouteStage({
  caseData,
  role,
  memoryPanel,
  onApprove,
  onGoToSignals,
}: {
  caseData: CaseData
  role: Role
  // El cierre de memoria llega como ranura: la etapa no necesita conocer sus
  // permisos ni sus llamadas, sólo dónde va después del recorrido.
  memoryPanel?: ReactNode
  onApprove: () => Promise<void> | void
  onGoToSignals?: () => void
}) {
  const retenida = caseData.facts.some(
    (fact) => fact.is_critical && fact.verification_status !== "confirmed",
  )

  return (
    <div className="route-stage">
      {retenida ? (
        <RouteGate
          caseData={caseData}
          role={role}
          onGoToSignals={onGoToSignals}
        />
      ) : (
        <RoutesComparison
          caseData={caseData}
          role={role}
          onApprove={onApprove}
          onGoToSignals={onGoToSignals}
        />
      )}
      {/* El cierre de memoria no depende de la ruta: es el retrato del
          testimonio, no la orientación. Se queda. */}
      {memoryPanel}
    </div>
  )
}

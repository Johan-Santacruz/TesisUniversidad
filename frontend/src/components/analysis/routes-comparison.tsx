import type { components } from "../../api/generated"
import { StatusBadge } from "./status-badge"


type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]

const routeNumbers = {
  emergency: "01",
  housing_stabilization: "02",
  return_relocation: "03",
} as const


export function RoutesComparison({
  caseData,
  role,
  onApprove,
}: {
  caseData: CaseData
  role: Role
  onApprove: () => Promise<void> | void
}) {
  const sources = new Map(caseData.sources.map((source) => [source.id, source]))
  const canValidate = role === "validador" || role === "admin"
  const isFinal = caseData.recommendation_status === "final"
  const canApprove = canValidate && caseData.critical_inconsistencies === 0 && !isFinal

  return (
    <section className="routes-section" aria-labelledby="routes-title">
      <div className="stage-section-heading routes-heading">
        <div>
          <p className="eyebrow">Tres recorridos comparables</p>
          <h2 id="routes-title">Rutas institucionales</h2>
        </div>
        <span className={isFinal ? "recommendation-label is-final" : "recommendation-label"}>
          {isFinal ? "Orientación final aprobada" : "Recomendación preliminar"}
        </span>
      </div>
      <p className="routes-disclaimer">
        Los tipos de ruta son fijos; sus pasos y fuentes responden a la lectura
        del caso. Confirme siempre disponibilidad y requisitos con la entidad.
      </p>
      <div className="route-grid">
        {caseData.routes.map((route) => (
          <article
            key={route.id}
            className={`route-journey route-${route.route_type}`}
            data-testid="route-journey"
          >
            <span className="route-number">{routeNumbers[route.route_type]}</span>
            <h3>{route.title}</h3>
            <p>{route.summary}</p>
            <StatusBadge
              status={route.verification_status}
              confidence={route.confidence_band}
              origin={route.origin}
            />
            <ol>
              {route.steps.length ? route.steps.map((step) => (
                <li key={`${route.id}-${step.title}`}>
                  <h4>{step.title}</h4>
                  <p>{step.instructions}</p>
                  {step.claims.map((claim) => {
                    const source = sources.get(claim.source_entry_id)
                    return (
                      <div key={`${step.title}-${claim.source_entry_id}`} className="grounded-claim">
                        <p>{claim.text}</p>
                        {source ? (
                          <>
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.entity} · {source.program}
                            </a>
                            <span>
                              Verificada el {new Date(source.verified_at).toLocaleDateString("es-CO")}
                            </span>
                            {source.disclaimer ? (
                              <strong>{source.disclaimer}</strong>
                            ) : null}
                          </>
                        ) : (
                          <strong>
                            Fuente no disponible — esta afirmación requiere revisión.
                          </strong>
                        )}
                      </div>
                    )
                  })}
                </li>
              )) : (
                <li className="route-empty">
                  Los proveedores no acordaron pasos válidos para esta ruta.
                </li>
              )}
            </ol>
          </article>
        ))}
      </div>
      {canValidate ? (
        <div className="approval-bar">
          <div>
            <strong>
              {caseData.critical_inconsistencies
                ? `${caseData.critical_inconsistencies} inconsistencias críticas pendientes`
                : "La revisión crítica está completa"}
            </strong>
            <p>La aprobación programa la eliminación del video a siete días.</p>
          </div>
          <button
            type="button"
            disabled={!canApprove}
            onClick={() => void onApprove()}
          >
            Aprobar orientación final
          </button>
        </div>
      ) : (
        <p className="role-note">
          Un validador debe confirmar los hechos críticos y aprobar la orientación.
        </p>
      )}
    </section>
  )
}

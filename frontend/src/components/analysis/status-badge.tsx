import type { components } from "../../api/generated"


type Origin = components["schemas"]["Origin"]
type VerificationStatus = components["schemas"]["VerificationStatus"]
type ConfidenceBand = components["schemas"]["ConfidenceBand"]

const verificationLabels: Record<VerificationStatus, string> = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  not_identified: "No identificado",
  inconsistent: "Inconsistente",
}

const originLabels: Record<Origin, string> = {
  mentioned: "Mencionado",
  inferred: "Inferido",
  contrasted: "Contrastado",
}

const confidenceLabels: Record<ConfidenceBand, string> = {
  high: "Confianza alta",
  medium: "Confianza media",
  low: "Confianza baja",
}


export function StatusBadge({
  status,
  confidence,
  origin,
}: {
  status: VerificationStatus
  confidence?: ConfidenceBand
  origin?: Origin
}) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true" className="status-icon">
        {status === "confirmed" ? "✓" : status === "inconsistent" ? "!" : "·"}
      </span>
      <span>{verificationLabels[status]}</span>
      {confidence ? <span className="status-detail">· {confidenceLabels[confidence]}</span> : null}
      {origin ? <span className="status-detail">· {originLabels[origin]}</span> : null}
    </span>
  )
}

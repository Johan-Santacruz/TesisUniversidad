import type { components } from "../../api/generated"
import { ClassificationPanel } from "./classification-panel"
import { VerificationPanel } from "./verification-panel"


type Fact = components["schemas"]["FactRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]


export function riskLabelForFacts(facts: Fact[]) {
  const urgency = facts.find(
    (fact) => fact.label.toLocaleLowerCase("es") === "urgencia",
  )
  const value = String(urgency?.value ?? "").toLocaleLowerCase("es")
  if (value === "high" || value === "alta" || value === "alto") {
    return "Riesgo alto"
  }
  if (value === "medium" || value === "media" || value === "medio") {
    return "Riesgo medio"
  }
  if (value === "low" || value === "baja" || value === "bajo") {
    return "Riesgo bajo"
  }
  return "Riesgo por confirmar"
}


export function EvidenceStage({
  classification,
  facts,
  role,
  selectedStartMs,
  onReview,
}: {
  classification: Record<string, unknown>
  facts: Fact[]
  role: Role
  selectedStartMs?: number | null
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  return (
    <div className="evidence-stage">
      <ClassificationPanel classification={classification} />
      <VerificationPanel
        facts={facts}
        role={role}
        selectedStartMs={selectedStartMs}
        onReview={onReview}
      />
    </div>
  )
}

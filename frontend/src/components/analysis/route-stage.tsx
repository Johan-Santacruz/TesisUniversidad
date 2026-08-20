import type { ReactNode } from "react"

import type { components } from "../../api/generated"
import { RoutesComparison } from "./routes-comparison"


type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]


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
  return (
    <div className="route-stage">
      <RoutesComparison
        caseData={caseData}
        role={role}
        onApprove={onApprove}
        onGoToSignals={onGoToSignals}
      />
      {memoryPanel}
    </div>
  )
}

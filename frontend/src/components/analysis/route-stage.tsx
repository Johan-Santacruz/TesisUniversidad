import type { components } from "../../api/generated"
import { RoutesComparison } from "./routes-comparison"
import { Timeline } from "./timeline"


type CaseData = components["schemas"]["CaseRead"]
type Role = components["schemas"]["UserRole"]
type TimelineEvent = components["schemas"]["TimelineEventRead"]


export function RouteStage({
  caseData,
  role,
  selectedId,
  onTimelineSelect,
  onApprove,
}: {
  caseData: CaseData
  role: Role
  selectedId: string | null
  onTimelineSelect: (event: TimelineEvent) => void
  onApprove: () => Promise<void> | void
}) {
  return (
    <div className="route-stage">
      <Timeline
        events={caseData.timeline}
        selectedId={selectedId}
        onSelect={onTimelineSelect}
      />
      <RoutesComparison
        caseData={caseData}
        role={role}
        onApprove={onApprove}
      />
    </div>
  )
}

import type { components } from "../../api/generated"
import { ClassificationPanel } from "./classification-panel"
import { VerificationPanel } from "./verification-panel"


type Fact = components["schemas"]["FactRead"]
type FactReview = components["schemas"]["FactReviewRequest"]
type Role = components["schemas"]["UserRole"]
type Segment = components["schemas"]["TranscriptSegment"]


export function EvidenceStage({
  classification,
  facts,
  role,
  segments,
  selectedStartMs,
  selectedFactId,
  onSelectFact,
  onSeek,
  onReview,
}: {
  classification: Record<string, unknown>
  facts: Fact[]
  role: Role
  segments?: Segment[]
  selectedStartMs?: number | null
  selectedFactId?: string | null
  onSelectFact?: (fact: Fact | null) => void
  onSeek?: (milliseconds: number) => void
  onReview: (factId: string, payload: FactReview) => Promise<void> | void
}) {
  return (
    <div className="evidence-stage">
      <ClassificationPanel classification={classification} />
      <VerificationPanel
        facts={facts}
        role={role}
        segments={segments}
        selectedStartMs={selectedStartMs}
        selectedFactId={selectedFactId}
        onSelectFact={onSelectFact}
        onSeek={onSeek}
        onReview={onReview}
      />
    </div>
  )
}

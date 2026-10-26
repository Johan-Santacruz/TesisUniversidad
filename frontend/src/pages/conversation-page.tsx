import { useAuth } from "../auth/auth-context"
import { AnalysisWorkspace } from "../components/analysis/analysis-workspace"
import { WorkspaceHeader } from "../components/workspace-header"
import { CaseFileActions } from "../features/history/case-report"

export default function ConversationPage() {
  const { user } = useAuth()

  return (
    <div className="analysis-app" data-testid="video-analysis-workspace">
      <WorkspaceHeader />
      {user ? (
        <AnalysisWorkspace
          role={user.role}
          caseActions={(caseData) => (
            <CaseFileActions
              caseId={caseData.id}
              approved={caseData.status === "approved"}
            />
          )}
        />
      ) : null}
    </div>
  )
}

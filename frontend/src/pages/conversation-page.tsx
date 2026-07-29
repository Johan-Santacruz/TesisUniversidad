import { Link } from "react-router-dom"
import { useAuth } from "../auth/auth-context"
import { AnalysisWorkspace } from "../components/analysis/analysis-workspace"

export default function ConversationPage() {
  const { user, logout } = useAuth()

  return (
    <div className="analysis-app" data-testid="video-analysis-workspace">
      <header className="workspace-header">
        <Link
          to="/"
          className="workspace-brand"
          aria-label="Volver al libro"
        >
          <span className="workspace-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>SIAD</strong>
            <small>Constructor de ruta de acción</small>
          </span>
        </Link>
        <div className="workspace-identity">
          <span>
            <strong>{user?.email}</strong>
            <small>{user?.role}</small>
          </span>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>
      {user ? <AnalysisWorkspace role={user.role} /> : null}
    </div>
  )
}
